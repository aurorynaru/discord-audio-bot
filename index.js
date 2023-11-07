require('dotenv').config()

const TOKEN = process.env.TOKEN

const Discord = require('discord.js')
const REST = Discord.REST
const Routes = Discord.Routes
const player = require('./player')
let isReady = false

const client = new Discord.Client({
    intents: [
        ...Object.keys(Discord.IntentsBitField.Flags).filter(
            (k) => !(Number(k) > 0)
        )
    ]
})

client.login(TOKEN)

client.on('ready', async () => {
    console.log(`${client.user.username} is ready!`)

    const rest = new REST().setToken(TOKEN)

    await rest.put(Routes.applicationCommands(client.user.id), {
        body: [
            new Discord.SlashCommandBuilder()
                .setName('leave')
                .setDescription('Leaves the voice channel')
                .setDMPermission(false),
            new Discord.SlashCommandBuilder()
                .setName('play')
                .setDescription('Plays a song ')
                .addStringOption((option) =>
                    option
                        .setName('song')
                        .setDescription('song')
                        .setRequired(true)
                ),
            new Discord.SlashCommandBuilder()
                .setName('playlist')
                .setDescription('Plays a playlist ')
                .addStringOption((option) =>
                    option
                        .setName('url')
                        .setDescription('playlist url')
                        .setRequired(true)
                ),
            new Discord.SlashCommandBuilder()
                .setName('skip')
                .setDescription('skips the current song playing'),

            new Discord.SlashCommandBuilder()
                .setName('volume')
                .setDescription('Adjust the volume of the music playback')
                .addIntegerOption((option) =>
                    option
                        .setName('level')
                        .setDescription('Volume level (0 to 10)')
                        .setRequired(true)
                )
                .setDMPermission(false),
            new Discord.SlashCommandBuilder()
                .setName('pause')
                .setDescription('Pause the music playback'),

            // Resume command
            new Discord.SlashCommandBuilder()
                .setName('resume')
                .setDescription('Resume the music playback'),
            new Discord.SlashCommandBuilder()
                .setName('help')
                .setDescription('Here are all of my commands!'),

            new Discord.SlashCommandBuilder()
                .setName('queue')
                .setDescription('queues a song')
                .addStringOption((option) =>
                    option
                        .setName('song')
                        .setDescription('The song to search for')
                        .setRequired(true)
                )
        ].map((k) => k.toJSON())
    })

    console.log('✅ Slash Commands Loaded Successfully')
    isReady = true
})
let isSkipping = false
let connection = null
let subscriber = null
let audioStatus = 'idle'
let songQueue = []

const playSongFn = async (i, song) => {
    try {
        const voice = await joinVC(i)
        await checkVC(i, voice)
        const { result } = await player.play(song)
        songQueue.shift()
        audioStatus = 'playing'
        console.log(`Now playing ${result[0].title}`)
        isSkipping = false
        const songName = result[0].title
        const duration = result[0].durationRaw
        const url = result[0].url
        const description = result[0].description
        const artist = result[0].channel
        const artistUrl = result[0].channel.url
        const thumbnail = result[0].thumbnails[0].url
        const icon = result[0].channel.icons[0].url

        await i.editReply({
            embeds: [
                {
                    title: String('Now Playing:'),
                    thumbnail: {
                        url: String(icon)
                    },
                    fields: [
                        {
                            name: 'Video:',
                            value: `[${songName}](${url})`,
                            inline: false
                        },
                        {
                            name: 'By:',
                            value: `[${artist}](${artistUrl})`,
                            inline: true
                        },
                        {
                            name: 'Duration:',
                            value: duration,
                            inline: true
                        }
                    ],
                    image: {
                        url: String(thumbnail)
                    },
                    footer: {
                        text: `Requested by ${i.user.username}`,
                        icon_url: i.user.displayAvatarURL({
                            format: 'png'
                        })
                    }
                }
            ]
        })
    } catch (e) {
        console.log(e)
        await i.editReply({
            embeds: [
                {
                    title: 'Error',
                    description:
                        'I had trouble getting the song, please try again.'
                }
            ]
        })
    }
}

const joinVC = async (i) => {
    const voice = i.member?.voice

    if (!voice.channel.joinable) {
        await i.editReply({
            embeds: [
                {
                    title: 'Error',
                    description: "I can't join your voice channel!"
                }
            ]
        })
        return
    }

    try {
        if (connection === null) {
            const res = await player.joinChannel(voice.channel)
            connection = res.connection
            subscriber = res.subscriber
            subscriber.player.on('stateChange', (oldState, newState) => {
                if (newState.hasOwnProperty('status')) {
                    audioStatus = newState.status
                }
            })
        }
    } catch (error) {
        console.error('Error while joining the voice channel:', error)
    }
    return voice
}

const checkVC = async (i, voice) => {
    const myVoiceChannel = player.myVc()

    if (myVoiceChannel == null) {
        await i.editReply({
            embeds: [
                {
                    title: 'Error',
                    description:
                        "Either i am in a voice channel but just restarted, or i'm not in a voice channel, in any case, please run `/join`"
                }
            ]
        })
        return
    }

    if (voice.channelId != myVoiceChannel) {
        await i.editReply({
            embeds: [
                {
                    title: 'Error',
                    description: 'You are not in the same voice channel as me!'
                }
            ]
        })
        return
    }
}
setInterval(() => {
    if (isReady) {
        if (!isSkipping) {
            if (audioStatus === 'idle') {
                if (songQueue.length > 0) {
                    audioStatus = 'playing'
                    playSongFn(songQueue[0].i, songQueue[0].song)
                }
            }
        }
    }
}, 1500)

client.on('interactionCreate', async (i) => {
    await i.deferReply()
    if (i.isCommand()) {
        //THE PLAY COMMAND
        if (i.commandName == 'play') {
            const song = i.options.getString('song')
            songQueue.unshift({ i, song })
            isSkipping = true
            playSongFn(songQueue[0].i, songQueue[0].song)

            //queue songs
        } else if (i.commandName == 'playlist') {
            const url = i.options.getString('url')
            await player.playlist(url)
            await i.editReply({
                embeds: [
                    {
                        title: `test`,
                        description: 'bruh'
                    }
                ]
            })
        } else if (i.commandName == 'queue') {
            if (audioStatus === 'playing' || songQueue.length > 0) {
                try {
                    // const voice = await joinVC(i)
                    // await checkVC(i, voice)

                    const song = i.options.getString('song')
                    const { result } = await player.searchDetails(song)

                    const url = result[0].url

                    console.log(url)
                    songQueue.push({ i, song: url })
                    console.log(`added to queue ${result[0].title}`)
                    const songName = result[0].title
                    const duration = result[0].durationRaw
                    const description = result[0].description
                    const artist = result[0].channel
                    const artistUrl = result[0].channel.url
                    const thumbnail = result[0].thumbnails[0].url
                    const icon = result[0].channel.icons[0].url
                    const index = songQueue.length

                    await i.editReply({
                        embeds: [
                            {
                                title: String(`added to queue: ${index}`),
                                thumbnail: {
                                    url: String(icon)
                                },
                                fields: [
                                    {
                                        name: 'Video:',
                                        value: `[${songName}](${url})`,
                                        inline: false
                                    },
                                    {
                                        name: 'By:',
                                        value: `[${artist}](${artistUrl})`,
                                        inline: true
                                    },
                                    {
                                        name: 'Duration:',
                                        value: duration,
                                        inline: true
                                    }
                                ],
                                image: {
                                    url: String(thumbnail)
                                },
                                footer: {
                                    text: `Requested by ${i.user.username}`,
                                    icon_url: i.user.displayAvatarURL({
                                        format: 'png'
                                    })
                                }
                            }
                        ]
                    })
                } catch (error) {
                    await i.editReply({
                        embeds: [
                            {
                                title: `${error}`,
                                description: 'f'
                            }
                        ]
                    })
                }
            } else {
                await i.editReply({
                    embeds: [
                        {
                            title: 'play 1 song',
                            description: 'bruh'
                        }
                    ]
                })
            }
            //skip
        } else if (i.commandName == 'skip') {
            isSkipping = true
            await player.skip()
            await i.editReply({
                embeds: [
                    {
                        title: `skipped current song`
                    }
                ]
            })
            isSkipping = false
            // leave
        } else if (i.commandName == 'leave') {
            songQueue.length = 0
            await player.leave()
            connection = null
            subscriber = null

            await i.editReply({
                embeds: [
                    {
                        title: 'Leaving...',
                        description: 'Left the voice channel...'
                    }
                ]
            })
        }
        //THE VOLUME COMMAND
        else if (i.commandName == 'volume') {
            const volumeLevel = i.options.getInteger('level')
            if (volumeLevel > 10) {
                try {
                    await player.setVolume(10)
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Volume changed',
                                description:
                                    'Max volume level is `10` \nVolume set to `10`'
                            }
                        ]
                    })
                } catch (e) {
                    console.log(e)
                    await i.editReply(String(e))
                }
            } else if (volumeLevel < 0) {
                try {
                    await player.setVolume(0)
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Volume changed',
                                description:
                                    'Min volume level is `0` \nVolume set to `0`'
                            }
                        ]
                    })
                } catch (e) {
                    console.log(e)
                    await i.editReply(String(e))
                }
            } else {
                try {
                    await player.setVolume(volumeLevel)
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Volume changed',
                                description: `Volume set to \`${volumeLevel}\``
                            }
                        ]
                    })
                } catch (e) {
                    console.log(e)
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Error',
                                description:
                                    'An error occurred, please try again.'
                            }
                        ]
                    })
                }
            }
            //THE PAUSE COMMAND
        } else if (i.commandName == 'pause') {
            try {
                if (player.isPlaying()) {
                    player.pause()
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Paused',
                                description: 'Paused the music.'
                            }
                        ]
                    })
                } else {
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Error',
                                description:
                                    'There is no music playing to pause.'
                            }
                        ]
                    })
                }
            } catch (e) {
                console.error(e)
                await i.editReply({
                    embeds: [
                        {
                            title: 'Error',
                            description:
                                'An error occurred while pausing playback.'
                        }
                    ]
                })
            }
        }
        //THE RESUME COMMAND
        else if (i.commandName == 'resume') {
            try {
                if (!player.isPlaying()) {
                    player.resume()
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Resumed',
                                description: 'Resumed the music.'
                            }
                        ]
                    })
                } else {
                    await i.editReply({
                        embeds: [
                            {
                                title: 'Error',
                                description:
                                    'There is no paused music to resume.'
                            }
                        ]
                    })
                }
            } catch (e) {
                console.error(e)
                await i.editReply({
                    embeds: [
                        {
                            title: 'Error',
                            description:
                                'An error occurred while pausing playback.'
                        }
                    ]
                })
            }
        } else if (i.commandName == 'help') {
            await i.editReply({
                embeds: [
                    {
                        title: String('Help is here!'),
                        thumbnail: {
                            url: client.user.displayAvatarURL({ format: 'png' })
                        },
                        color: 0xde02fc,
                        description: String(
                            'Use a `/` before the following commands to use them:'
                        ),
                        fields: [
                            {
                                name: 'help',
                                value: 'Lists command list',
                                inline: true
                            },
                            {
                                name: 'play',
                                value: `Plays a song`,
                                inline: true
                            },
                            {
                                name: 'volume',
                                value: 'Changes volume level',
                                inline: true
                            },
                            {
                                name: 'pause',
                                value: 'Pauses the music',
                                inline: true
                            },
                            {
                                name: 'resume',
                                value: 'Resumes the music',
                                inline: true
                            },
                            {
                                name: 'leave',
                                value: 'Leaves voice channel',
                                inline: true
                            }
                        ],
                        footer: {
                            text: `Requested by ${i.user.username}`,
                            icon_url: i.user.displayAvatarURL({ format: 'png' })
                        }
                    }
                ]
            })
        }
    }
})
