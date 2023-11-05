const {
    createAudioResource,
    AudioPlayerStatus,
    entersState
} = require('@discordjs/voice')
const { createAudioPlayer } = require('@discordjs/voice')
const { PlayerSubscription } = require('@discordjs/voice')
const { joinVoiceChannel, VoiceConnection } = require('@discordjs/voice')
const { GuildChannel } = require('discord.js')

let isPlaying = false
const player = require('play-dl')

let connection

let subscriber
const youtubeRegExp =
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+(&.*)?|^https?:\/\/youtu.be\/[\w-]+$/

const getVideoInfo = async (song) => {
    try {
        if (youtubeRegExp.test(song)) {
            const video = await player.video_basic_info(song)

            if (!video || video?.length == 0) {
                throw new Error('No Music Found/invalid url')
            } else {
                return { result: [video.video_details] }
            }
        } else {
            let searches = []

            searches.push(
                player
                    .search(song, {
                        fuzzy: true
                    })
                    .catch(() => null)
            )

            const result = (await Promise.all(searches)).find((x) => x != null)

            if (!result || result?.length == 0) {
                throw new Error('No Music Found')
            } else {
                return result
            }
        }
    } catch (error) {
        throw new Error(error)
    }
}

module.exports = {
    //JOIN
    joinChannel: async (channel) => {
        if (connection != null) {
            throw new Error('Already connected to a voice channel')
        }

        connection = joinVoiceChannel({
            guildId: channel.guildId,
            channelId: channel.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        })

        const player = connection.subscribe(createAudioPlayer())
        subscriber = player

        // subscriber.player.on('stateChange', (oldState, newState) => {
        //     if (newState.hasOwnProperty('status')) {
        //         audioStatus = newState.status
        //     }

        //     console.log(audioStatus)
        // })

        return { connection, subscriber }
    },
    //LEAVE
    leave: async () => {
        connection?.destroy()
        connection = null
    },
    searchDetails: async (song) => {
        if (youtubeRegExp.test(song)) {
            const video = await getVideoInfo(song)
            return video
        } else {
            const result = await getVideoInfo(song)

            return { result }
        }
    },
    myVc: () => connection?.joinConfig.channelId,
    //PLAY

    play: async (song) => {
        if (youtubeRegExp.test(song)) {
            const video = await getVideoInfo(song)

            if (!video || video?.length == 0) {
                throw new Error('No Music Found')
            }

            isPlaying = true
            let stream = await player.stream(song)

            stream.pause()

            const resource = createAudioResource(stream.stream, {
                inputType: stream.type
                //inlineVolume: true
            })

            //resource.volume?.setVolume(0.7)

            subscriber.player.play(resource)

            return video
        } else {
            const result = await getVideoInfo(song)

            if (!result || result?.length == 0) {
                throw new Error('No Music Found')
            }
            isPlaying = true
            let stream = await player.stream(result[0].url)

            stream.pause()

            const resource = createAudioResource(stream.stream, {
                inputType: stream.type
                //inlineVolume: true
            })

            //resource.volume?.setVolume(.9)

            subscriber.player.play(resource)

            return { result }
        }
    },
    //PAUSE
    skip: () => {
        if (
            subscriber &&
            subscriber.player &&
            subscriber.player.state.status === AudioPlayerStatus.Playing
        ) {
            subscriber.player.stop()

            isPlaying = false
        }
    },
    pause: () => {
        if (
            subscriber &&
            subscriber.player &&
            subscriber.player.state.status === AudioPlayerStatus.Playing
        ) {
            subscriber.player.pause()

            isPlaying = false
        }
    },

    //RESUME
    resume: () => {
        if (
            subscriber &&
            subscriber.player &&
            subscriber.player.state.status === AudioPlayerStatus.Paused
        ) {
            subscriber.player.unpause()

            isPlaying = true
        }
    },

    //IS PLAYING?
    isPlaying: () => {
        return isPlaying
    },
    //VOLUME
    setVolume: (volume) => {
        if (subscriber && subscriber.player) {
            if (volume < 0) volume = 0
            if (volume > 10) volume = 10
            subscriber.player.state.resource.volume?.setVolume(volume)
        }
    }
}
