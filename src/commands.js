import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getGuild, save } from './store.js';

const ADMIN = PermissionFlagsBits.ManageGuild;

export const commands = [
  new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Where tickets go, who answers them, and where transcripts land')
    .setDefaultMemberPermissions(ADMIN)
    .addChannelOption((o) => o.setName('category').setDescription('The category new ticket channels are created in').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('The support role that can see every ticket').setRequired(true))
    .addChannelOption((o) => o.setName('log').setDescription('Where closed tickets leave a transcript').addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName('message').setDescription('The first message in every new ticket').setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the button that opens a ticket, in this channel')
    .setDefaultMemberPermissions(ADMIN)
    .addStringOption((o) => o.setName('text').setDescription('The text above the button').setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName('ticket-add')
    .setDescription('Let someone else see this ticket')
    .addUserOption((o) => o.setName('user').setDescription('Who to add').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ticket-close')
    .setDescription('Close this ticket and post its transcript'),
].map((c) => c.toJSON());

const TICKET_NAME = /^ticket-/;

export async function handleCommand(interaction) {
  const settings = await getGuild(interaction.guildId);

  if (interaction.commandName === 'ticket-setup') {
    settings.categoryId = interaction.options.getChannel('category').id;
    settings.supportRoleId = interaction.options.getRole('role').id;
    const log = interaction.options.getChannel('log');
    if (log) settings.logChannelId = log.id;
    const message = interaction.options.getString('message');
    if (message) settings.welcome = message;
    await save();
    await interaction.reply({
      content: `Tickets open under <#${settings.categoryId}>, <@&${settings.supportRoleId}> sees them${settings.logChannelId ? `, transcripts go to <#${settings.logChannelId}>` : ''}. Post the button with /ticket-panel.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'ticket-panel') {
    if (!settings.categoryId || !settings.supportRoleId) {
      await interaction.reply({ content: 'Run /ticket-setup first: the bot needs a category and a support role.', ephemeral: true });
      return;
    }
    const text = interaction.options.getString('text') || 'Need help? Press the button and a private channel opens for you.';
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('Open a ticket').setStyle(ButtonStyle.Primary),
    );
    await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle('Support').setDescription(text).setColor(0x5865f2)], components: [row] });
    await interaction.reply({ content: 'Panel posted.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'ticket-add') {
    if (!TICKET_NAME.test(interaction.channel?.name ?? '')) {
      await interaction.reply({ content: 'Use this inside a ticket channel.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    await interaction.reply({ content: `<@${user.id}> can see this ticket now.` });
    return;
  }

  if (interaction.commandName === 'ticket-close') {
    if (!TICKET_NAME.test(interaction.channel?.name ?? '')) {
      await interaction.reply({ content: 'Use this inside a ticket channel.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: 'Closing this ticket.' });
    await closeTicket(interaction.channel, interaction.user, settings);
  }
}

export async function handleButton(interaction) {
  const settings = await getGuild(interaction.guildId);

  if (interaction.customId === 'open_ticket') {
    if (!settings.categoryId || !settings.supportRoleId) {
      await interaction.reply({ content: 'Tickets are not set up yet. An admin has to run /ticket-setup.', ephemeral: true });
      return;
    }
    const existing = settings.open[interaction.user.id];
    if (existing && interaction.guild.channels.cache.has(existing)) {
      await interaction.reply({ content: `You already have a ticket open: <#${existing}>.`, ephemeral: true });
      return;
    }
    settings.counter += 1;
    const channel = await interaction.guild.channels.create({
      name: `ticket-${String(settings.counter).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: settings.categoryId,
      topic: `Ticket of ${interaction.user.tag} (${interaction.user.id})`,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: settings.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ],
    });
    settings.open[interaction.user.id] = channel.id;
    await save();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close ticket').setStyle(ButtonStyle.Danger),
    );
    await channel.send({
      content: `<@${interaction.user.id}> <@&${settings.supportRoleId}>`,
      embeds: [new EmbedBuilder().setDescription(settings.welcome).setColor(0x5865f2)],
      components: [row],
    });
    await interaction.reply({ content: `Your ticket is open: <#${channel.id}>.`, ephemeral: true });
    return;
  }

  if (interaction.customId === 'close_ticket') {
    await interaction.reply({ content: `Closed by <@${interaction.user.id}>. The channel goes in a few seconds.` });
    await closeTicket(interaction.channel, interaction.user, settings);
  }
}

async function closeTicket(channel, closedBy, settings) {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const lines = messages
    ? [...messages.values()].reverse().map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || ''}${m.attachments.size ? ` (${[...m.attachments.values()].map((a) => a.url).join(' ')})` : ''}`)
    : ['(transcript unavailable)'];
  const owner = Object.entries(settings.open).find(([, id]) => id === channel.id)?.[0];
  if (owner) delete settings.open[owner];
  await save();

  if (settings.logChannelId) {
    const log = channel.guild.channels.cache.get(settings.logChannelId);
    if (log) {
      const file = new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `${channel.name}.txt` });
      await log
        .send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`${channel.name} closed`)
              .setDescription(`Opened by ${owner ? `<@${owner}>` : 'unknown'}, closed by <@${closedBy.id}>. ${lines.length} message(s).`)
              .setColor(0xed4245)
              .setTimestamp(),
          ],
          files: [file],
        })
        .catch((err) => console.error('[ticket-bot] transcript not posted:', err.message));
    }
  }
  setTimeout(() => channel.delete('Ticket closed').catch(() => {}), 5000);
}
