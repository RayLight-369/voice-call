"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "./socket.io";
import Peer from "peerjs";
import { Mic, MicOff, Monitor, Users, X, Volume2, MessageSquare } from "lucide-react";

const App = () => {
  const [ muted, setMuted ] = useState( false );
  const [ joined, setJoined ] = useState( false );
  const [ name, setName ] = useState( "" );
  const [ room, setRoom ] = useState( "" );
  const [ participants, setParticipants ] = useState( [] );
  const [ messageLog, setMessageLog ] = useState( [] );
  const [ speaking, setSpeaking ] = useState( {} );
  const [ noiseCancellation, setNoiseCancellation ] = useState( true );
  const [ screens, setScreens ] = useState( {} );
  const [ viewScreen, setViewScreen ] = useState( null );

  const localStreamRef = useRef( null );
  const screenStreamRef = useRef( null );
  const peerRef = useRef( null );
  const connectionsRef = useRef( {} );
  const screenConnectionsRef = useRef( {} );
  const audioAnalyzersRef = useRef( {} );
  const screenRefs = useRef( {} );
  const currentVideoRef = useRef( null );

  useEffect( () => {
    socket.connect();
    return () => socket.disconnect();
  }, [] );

  useEffect( () => {
    if ( !joined ) return;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia( {
          audio: {
            noiseSuppression: noiseCancellation,
            echoCancellation: noiseCancellation,
          },
        } );

        localStreamRef.current = stream;
        detectSpeech( "You", stream );

        const peer = new Peer();
        peerRef.current = peer;

        peer.on( "open", ( id ) => {
          socket.emit( "join-room", { name, room, peerId: id } );
        } );

        peer.on( "call", ( call ) => {
          const isScreenShare = call.metadata?.screen;
          console.log( isScreenShare );
          if ( isScreenShare ) {
            call.answer();
            call.on( "stream", ( remoteStream ) => {
              console.log( remoteStream );
              setScreens( ( prev ) => ( { ...prev, [ call.metadata.name ]: remoteStream } ) );
            } );
          } else {
            call.answer( stream );
            call.on( "stream", ( remoteStream ) => {
              addAudio( call.metadata?.name || "Unknown", remoteStream );
            } );
          }
        } );

        socket.on( "users-in-room", ( users ) => {
          setParticipants( users );
          users.forEach( ( user ) => {
            if ( user.peerId === peer.id ) return;
            if ( !connectionsRef.current[ user.peerId ] ) {
              const call = peer.call( user.peerId, stream, { metadata: { name } } );
              call.on( "stream", ( remoteStream ) => {
                addAudio( user.name, remoteStream );
              } );
              connectionsRef.current[ user.peerId ] = call;
            }
          } );
        } );

        socket.on( "user-joined", ( { name } ) => {
          logEvent( `${ name } joined the room` );
          showNotification( `${ name } joined the room` );
        } );

        socket.on( "user-left", ( { name, peerId } ) => {
          logEvent( `${ name } left the room` );
          showNotification( `${ name } left the room` );
          delete speaking[ peerId ];
        } );

        requestNotificationPermission();
      } catch ( err ) {
        console.error( "Media init error:", err );
        alert( "Mic access required." );
      }
    };

    init();
  }, [ joined, noiseCancellation ] );

  useEffect( () => {
    Object.entries( screens ).forEach( ( [ user, stream ] ) => {
      const video = screenRefs.current[ user ];
      if ( video && video.srcObject !== stream ) {
        video.srcObject = stream;
        console.log( `${ user } video mounted and stream assigned.` );
      }
    } );
  }, [ screens ] );

  useEffect( () => {
    if ( viewScreen && currentVideoRef.current ) {
      currentVideoRef.current.srcObject = viewScreen;
    }
  }, [ viewScreen ] );

  const detectSpeech = ( id, stream ) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource( stream );
    source.connect( analyser );

    const dataArray = new Uint8Array( analyser.frequencyBinCount );
    audioAnalyzersRef.current[ id ] = analyser;

    const update = () => {
      analyser.getByteFrequencyData( dataArray );
      const avg = dataArray.reduce( ( a, b ) => a + b, 0 ) / dataArray.length;
      setSpeaking( ( prev ) => ( { ...prev, [ id ]: avg > 20 } ) );
      requestAnimationFrame( update );
    };
    update();
  };

  const addAudio = ( id, stream ) => {
    detectSpeech( id, stream );
    const audio = document.createElement( "audio" );
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.muted = false;
    document.body.appendChild( audio );
  };

  const toggleMute = () => {
    const localStream = localStreamRef.current;
    if ( !localStream ) return;
    const audioTrack = localStream.getAudioTracks()[ 0 ];
    audioTrack.enabled = !audioTrack.enabled;
    setMuted( !audioTrack.enabled );
  };

  const shareScreen = async () => {
    if ( !peerRef.current ) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia( { video: true } );
      screenStreamRef.current = screenStream;
      participants.forEach( ( user ) => {
        if ( user.peerId === peerRef.current.id ) return;
        const call = peerRef.current.call( user.peerId, screenStream, {
          metadata: { name, screen: true },
        } );
        screenConnectionsRef.current[ user.peerId ] = call;
      } );
    } catch ( err ) {
      console.error( "Error sharing screen:", err );
    }
  };

  const handleJoin = () => {
    if ( name.trim() && room.trim() ) {
      setJoined( true );
    }
  };

  const logEvent = ( message ) => {
    setMessageLog( ( prev ) => [ ...prev, { message, time: new Date().toLocaleTimeString() } ] );
  };

  const showNotification = ( text ) => {
    if ( Notification.permission === "granted" ) {
      new Notification( text );
    }
  };

  const requestNotificationPermission = () => {
    if ( "Notification" in window && Notification.permission !== "granted" ) {
      Notification.requestPermission();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-800 dark:text-slate-100">
      { !joined ? (
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-slate-800 rounded-2xl shadow-lg">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Join Audio Conference</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Connect with your team in real-time</p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Your Name
                </label>
                <input
                  id="name"
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition"
                  value={ name }
                  onChange={ ( e ) => setName( e.target.value ) }
                />
              </div>

              <div>
                <label htmlFor="room" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Room Name
                </label>
                <input
                  id="room"
                  placeholder="Enter room name"
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition"
                  value={ room }
                  onChange={ ( e ) => setRoom( e.target.value ) }
                />
              </div>

              <label className="flex items-center space-x-3 text-sm cursor-pointer">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={ noiseCancellation }
                    onChange={ ( e ) => setNoiseCancellation( e.target.checked ) }
                  />
                  <div
                    className={ `w-10 h-5 ${ noiseCancellation ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-700" } rounded-full transition` }
                  ></div>
                  <div
                    className={ `absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition transform ${ noiseCancellation ? "translate-x-5" : "" }` }
                  ></div>
                </div>
                <span className="text-slate-700 dark:text-slate-300">Enable Noise Cancellation</span>
              </label>
            </div>

            <button
              onClick={ handleJoin }
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Join Room
            </button>
          </div>
        </div>
      ) : (
        <div className="container mx-auto p-4 max-w-6xl">
          <header className="flex items-center justify-between py-4 border-b border-slate-200 dark:border-slate-700 mb-6">
            <div className="flex items-center space-x-2">
              <Volume2 className="h-6 w-6 text-blue-500" />
              <h1 className="text-xl font-bold">Audio Conference</h1>
            </div>
            <div className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-sm font-medium">
              Room: { room }
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Controls */ }
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={ toggleMute }
                  className={ `flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition ${ muted
                    ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                    }` }
                >
                  { muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" /> }
                  <span>{ muted ? "Unmute" : "Mute" }</span>
                </button>

                <button
                  onClick={ shareScreen }
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded-lg font-medium transition"
                >
                  <Monitor className="h-4 w-4" />
                  <span>Share Screen</span>
                </button>
              </div>

              {/* Shared Screens */ }
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-5 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-2 mb-4">
                  <Monitor className="h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-lg">Shared Screens</h2>
                </div>

                { Object.keys( screens ).length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <p>No screens are currently being shared</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    { Object.entries( screens ).map( ( [ user, stream ] ) => (
                      <div
                        key={ user }
                        className="cursor-pointer overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition group"
                        onClick={ () => setViewScreen( stream ) }
                      >
                        <div className="relative aspect-video bg-slate-100 dark:bg-slate-900">
                          <video
                            ref={ ( el ) => ( screenRefs.current[ user ] = el ) }
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          ></video>
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                            <div className="bg-white dark:bg-slate-800 rounded-full p-2">
                              <Monitor className="h-5 w-5 text-blue-500" />
                            </div>
                          </div>
                        </div>
                        <div className="p-2 text-center text-sm font-medium bg-slate-50 dark:bg-slate-900/50">
                          { user }
                        </div>
                      </div>
                    ) ) }
                  </div>
                ) }
              </div>

              {/* Room Events */ }
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-5 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-2 mb-4">
                  <MessageSquare className="h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-lg">Room Events</h2>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                  { messageLog.length === 0 ? (
                    <p className="text-center py-4 text-slate-500 dark:text-slate-400">No events yet</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      { messageLog.map( ( log, index ) => (
                        <li key={ index } className="flex items-start">
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono mr-2">
                            [{ log.time }]
                          </span>
                          <span className="text-slate-700 dark:text-slate-300">{ log.message }</span>
                        </li>
                      ) ) }
                    </ul>
                  ) }
                </div>
              </div>
            </div>

            {/* Participants */ }
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-5 border border-slate-200 dark:border-slate-700 h-fit">
              <div className="flex items-center space-x-2 mb-4">
                <Users className="h-5 w-5 text-slate-500" />
                <h2 className="font-semibold text-lg">Participants ({ participants.length + 1 })</h2>
              </div>

              <div className="space-y-2">
                <div
                  className={ `flex items-center p-3 rounded-lg ${ speaking[ "You" ]
                    ? "bg-green-100 dark:bg-green-900/30 border-l-4 border-green-500"
                    : "bg-slate-50 dark:bg-slate-900"
                    }` }
                >
                  <div
                    className={ `w-8 h-8 rounded-full flex items-center justify-center ${ speaking[ "You" ]
                      ? "bg-green-500 text-white"
                      : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                      }` }
                  >
                    { name.charAt( 0 ).toUpperCase() }
                  </div>
                  <div className="ml-3">
                    <p className="font-medium">You { muted && "(Muted)" }</p>
                  </div>
                  { speaking[ "You" ] && (
                    <div className="ml-auto flex space-x-1">
                      <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse delay-75"></div>
                      <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse delay-150"></div>
                    </div>
                  ) }
                </div>

                { participants.map( ( p ) => (
                  <div
                    key={ p.peerId }
                    className={ `flex items-center p-3 rounded-lg ${ speaking[ p.name ]
                      ? "bg-green-100 dark:bg-green-900/30 border-l-4 border-green-500"
                      : "bg-slate-50 dark:bg-slate-900"
                      }` }
                  >
                    <div
                      className={ `w-8 h-8 rounded-full flex items-center justify-center ${ speaking[ p.name ]
                        ? "bg-green-500 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                        }` }
                    >
                      { p.name.charAt( 0 ).toUpperCase() }
                    </div>
                    <div className="ml-3">
                      <p className="font-medium">{ p.name }</p>
                    </div>
                    { speaking[ p.name ] && (
                      <div className="ml-auto flex space-x-1">
                        <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse delay-75"></div>
                        <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse delay-150"></div>
                      </div>
                    ) }
                  </div>
                ) ) }
              </div>
            </div>
          </div>

          {/* Fullscreen view */ }
          { viewScreen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold">Shared Screen</h3>
                  <button
                    onClick={ () => setViewScreen( null ) }
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4">
                  <video
                    ref={ currentVideoRef }
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-auto max-h-[70vh] object-contain bg-slate-900 rounded-lg"
                  ></video>
                </div>
              </div>
            </div>
          ) }
        </div>
      ) }
    </div>
  );
};

export default App;
