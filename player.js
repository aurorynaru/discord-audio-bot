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
const songQueue = require('./constant.js')

let connection

let subscriber

const getVideoInfo = async (song) => {
    const youtubeRegExp =
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+(&.*)?|^https?:\/\/youtu.be\/[\w-]+$/

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
}

module.exports = {
    //JOIN
    joinChannel: async (channel) => {
        if (connection != null) {
            throw new Error('Already connected to a voice channel')
        }
        const audioPlayer = createAudioPlayer()
        connection = joinVoiceChannel({
            guildId: channel.guildId,
            channelId: channel.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        })
        const player = connection.subscribe(audioPlayer)
        subscriber = player

        audioPlayer.on(AudioPlayerStatus.Playing, () => {
            console.log('The audio player has started playing!')
        })

        audioPlayer.on(AudioPlayerStatus.Idle, () => {
            console.log(songQueue)
        })
    },
    //LEAVE
    leave: async () => {
        connection?.destroy()
        connection = null
    },
    searchDetails: async (song) => {
        return await getVideoInfo(song)
    },
    myVc: () => connection?.joinConfig.channelId,
    //PLAY

    play: async (song) => {
        const youtubeRegExp =
            /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+(&.*)?|^https?:\/\/youtu.be\/[\w-]+$/

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

            //resource.volume?.setVolume(2)

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

            //resource.volume?.setVolume(2)

            subscriber.player.play(resource)

            return { result }
        }
    },
    //PAUSE
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
