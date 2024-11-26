const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, joinVoiceChannel } = require('@discordjs/voice');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
    ],
});

const VOICE_CHANNEL_IDS = ['1307983573520744458']; // Replace with your voice channel IDs
const GUILD_ID = '1307982159235256350'; // Replace with your server's ID

// Lock channels
async function lockVoiceChannels() {
    const guild = await client.guilds.fetch(GUILD_ID);
    const everyoneRole = guild.roles.everyone;

    for (const channelId of VOICE_CHANNEL_IDS) {
        const channel = await guild.channels.fetch(channelId);
        if (channel) {
            await channel.permissionOverwrites.edit(everyoneRole, { [PermissionsBitField.Flags.Connect]: false });
            console.log(`Locked voice channel: ${channel.name}`);
        }
    }
}

// Ensure bot permissions are good
async function ensureBotPermissions(channel) {
    const botRole = channel.guild.members.me.roles.highest; // Get the bot's highest role
    const botOverwrites = channel.permissionOverwrites.cache.get(botRole.id);

    if (!botOverwrites) {
        console.log(`Adding permissions for bot in channel: ${channel.name}`);
        await channel.permissionOverwrites.create(botRole, {
            [PermissionsBitField.Flags.Connect]: true,
            [PermissionsBitField.Flags.ManageChannels]: true,
        });
    } else {
        console.log(`Bot already has permissions in channel: ${channel.name}`);
    }
}

// Unlock voice channels
async function unlockVoiceChannels() {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const everyoneRole = guild.roles.everyone;

        for (const channelId of VOICE_CHANNEL_IDS) {
            const channel = await guild.channels.fetch(channelId);
            if (channel) {
                // Ensure bot has permissions in the channel
                await ensureBotPermissions(channel);

                // Unlock the channel
                await channel.permissionOverwrites.edit(everyoneRole, { [PermissionsBitField.Flags.Connect]: true });
                console.log(`Unlocked voice channel: ${channel.name}`);
            } else {
                console.log(`Channel not found: ${channelId}`);
            }
        }
    } catch (error) {
        console.error(`Error unlocking voice channels: ${error.message}`);
    }
}

async function playAudioAndLockChannel(channel) {
    // Join the voice channel
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    // Create an audio player
    const player = createAudioPlayer();

    // Path to the audio file (make sure the file exists)
    const audioFilePath = path.join(__dirname, 'audio.mp3'); // Adjust this path to your audio file location
    const resource = createAudioResource(fs.createReadStream(audioFilePath));

    // Play the audio
    player.play(resource);

    // Listen for player events
    player.on(AudioPlayerStatus.Idle, async () => {
        console.log('Audio finished playing, kicking members and locking the channel...');
        
        // Kick all members from the voice channel
        channel.members.forEach(async (member) => {
            try {
                await member.voice.disconnect();
                console.log(`Kicked ${member.user.tag} from the channel.`);
            } catch (error) {
                console.error(`Failed to kick ${member.user.tag}: ${error.message}`);
            }
        });

        // Leave the voice channel after playing the audio
        connection.destroy();

        // Lock the channel
        await lockVoiceChannels();
    });

    // Connect the player to the connection
    connection.subscribe(player);
}


client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Schedule tasks
    cron.schedule('0 1 * * *', playAudioAndLockChannel); // Runs at 1:00 AM
    cron.schedule('0 8 * * *', unlockVoiceChannels); // Runs at 8:00 AM
});

// Test commands
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!')) return; // Ignore messages without the command prefix
    if (message.author.bot) return; // Ignore bot messages

    if (message.content === '!lock') {
        await lockVoiceChannels();
        message.channel.send('Voice channels have been locked!');
    }

    if (message.content === '!unlock') {
        await unlockVoiceChannels();
        message.channel.send('Voice channels have been unlocked!');
    }

    if (message.content === '!check') {
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            for (const channelId of VOICE_CHANNEL_IDS) {
                const channel = await guild.channels.fetch(channelId);
                if (channel) {
                    const everyoneOverwrites = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
                    const botRole = guild.members.me.roles.highest;
                    const botOverwrites = channel.permissionOverwrites.cache.get(botRole.id);

                    console.log(`Channel: ${channel.name}`);
                    console.log(`@everyone CONNECT permission: ${everyoneOverwrites?.deny.has(PermissionsBitField.Flags.Connect)}`);
                    console.log(`Bot CONNECT permission: ${botOverwrites?.allow.has(PermissionsBitField.Flags.Connect)}`);
                } else {
                    console.log(`Channel not found: ${channelId}`);
                }
            }
        } catch (error) {
            console.error(`Error in !check command: ${error.message}`);
        }
    }

    if (message.content === '!playandlock') {
        const channel = message.member?.voice.channel;
        if (channel) {
            await playAudioAndLockChannel(channel);
            message.channel.send('Playing audio and will lock the channel after!');
        } else {
            message.channel.send('You must be in a voice channel to use this command!');
        }
    }
        
});

client.login(process.env.FATAMYTOKEN);
