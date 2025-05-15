"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "./socket.io";
import Peer from "peerjs";
import {
  Mic,
  MicOff,
  Monitor,
  Users,
  X,
  Volume2,
  MessageSquare,
  Sparkles,
  Settings,
  ChevronRight,
  Shield,
  Zap,
  Waves,
} from "lucide-react";

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
  const [ socketStatus, setSocketStatus ] = useState( "disconnected" );
  const [ audioQuality, setAudioQuality ] = useState( "high" );
  const [ isScreenSharing, setIsScreenSharing ] = useState( false );

  const localStreamRef = useRef( null );
  const screenStreamRef = useRef( null );
  const peerRef = useRef( null );
  const connectionsRef = useRef( {} );
  const screenConnectionsRef = useRef( {} );
  const audioAnalyzersRef = useRef( {} );
  const screenRefs = useRef( {} );
  const currentVideoRef = useRef( null );

  useEffect( () => {
    socket.on( "connect", () => setSocketStatus( "connected" ) );
    socket.on( "connect_error", () => setSocketStatus( "error" ) );
    socket.on( "disconnect", () => setSocketStatus( "disconnected" ) );

    return () => {
      socket.off( "connect" );
      socket.off( "connect_error" );
      socket.off( "disconnect" );
    };
  }, [] );

  useEffect( () => {
    if ( !joined ) return;

    const init = async () => {
      try {
        socket.connect();
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
          if ( isScreenShare ) {
            call.answer();
            call.on( "stream", ( remoteStream ) => {
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

            if ( isScreenSharing && screenStreamRef.current ) {
              const call = peer.call( user.peerId, screenStreamRef.current, {
                metadata: { name, screen: true },
              } );
              screenConnectionsRef.current[ user.peerId ] = call;
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
          setScreens( ( prev ) => {
            const updated = { ...prev };
            delete updated[ name ];
            return updated;
          } );
        } );

        requestNotificationPermission();
      } catch ( err ) {
        console.error( "Media init error:", err );
        alert( "Mic access required." );
      }
    };

    init();

    return () => {
      if ( socket.connected ) socket.disconnect();
      socket.off( "users-in-room" );
      socket.off( "user-joined" );
      socket.off( "user-left" );

      if ( localStreamRef.current )
        localStreamRef.current.getTracks().forEach( ( t ) => t.stop() );
      if ( screenStreamRef.current )
        screenStreamRef.current.getTracks().forEach( ( t ) => t.stop() );
    };
  }, [ joined, noiseCancellation ] );

  useEffect( () => {
    Object.entries( screens ).forEach( ( [ user, stream ] ) => {
      const video = screenRefs.current[ user ];
      if ( video && video.srcObject !== stream ) {
        video.srcObject = stream;
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
      setIsScreenSharing( true );

      screenStream.getVideoTracks()[ 0 ].addEventListener( "ended", () => {
        screenStreamRef.current = null;
        setIsScreenSharing( false );
        setScreens( ( prev ) => {
          const updated = { ...prev };
          delete updated[ name ];
          return updated;
        } );
      } );

      setScreens( ( prev ) => ( { ...prev, [ name ]: screenStream } ) );

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
          <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-slate-800 rounded-2xl shadow-lg relative overflow-hidden">
            {/* Decorative elements */ }
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-blue-500/10 rounded-full blur-xl"></div>

            <div className="text-center relative">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg mb-4">
                <Volume2 className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Join Audio Conference</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Connect with your team in real-time</p>
            </div>

            <div className="space-y-5 relative">
              <div className="group">
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Your Name
                </label>
                <div className="relative">
                  <input
                    id="name"
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 pl-10 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition"
                    value={ name }
                    onChange={ ( e ) => setName( e.target.value ) }
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500">
                    <Users className="h-5 w-5" />
                  </div>
                </div>
              </div>

              <div className="group">
                <label htmlFor="room" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Room Name
                </label>
                <div className="relative">
                  <input
                    id="room"
                    placeholder="Enter room name"
                    className="w-full px-4 py-3 pl-10 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition"
                    value={ room }
                    onChange={ ( e ) => setRoom( e.target.value ) }
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Audio Settings
                </label>

                {/* Custom checkbox for noise cancellation */ }
                <div
                  className="flex items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={ () => setNoiseCancellation( !noiseCancellation ) }
                >
                  <div className="relative">
                    <div
                      className={ `w-12 h-6 rounded-full transition-colors duration-300 ${ noiseCancellation ? "bg-gradient-to-r from-blue-400 to-blue-600" : "bg-slate-300 dark:bg-slate-700" }` }
                    >
                      <div
                        className={ `absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${ noiseCancellation ? "translate-x-6" : "" }` }
                      >
                        { noiseCancellation && (
                          <div className="absolute inset-0 flex items-center justify-center text-blue-500">
                            <Sparkles className="h-3 w-3" />
                          </div>
                        ) }
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="font-medium">Noise Cancellation</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Reduce background noise during calls
                    </div>
                  </div>
                  <div
                    className={ `text-xs font-medium px-2 py-1 rounded-full ${ noiseCancellation ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-400" }` }
                  >
                    { noiseCancellation ? "ON" : "OFF" }
                  </div>
                </div>

                {/* Audio quality selector */ }
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium flex items-center">
                      <Waves className="h-4 w-4 mr-2 text-slate-500" />
                      Audio Quality
                    </div>
                    <div className="text-xs font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      { audioQuality.toUpperCase() }
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    { [ "low", "medium", "high" ].map( ( quality ) => (
                      <button
                        key={ quality }
                        onClick={ () => setAudioQuality( quality ) }
                        className={ `flex-1 py-1.5 rounded-lg text-xs font-medium transition ${ audioQuality === quality
                          ? "bg-blue-500 text-white"
                          : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                          }` }
                      >
                        { quality.charAt( 0 ).toUpperCase() + quality.slice( 1 ) }
                      </button>
                    ) ) }
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={ handleJoin }
              className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg shadow-blue-500/20 relative overflow-hidden group"
            >
              <div className="absolute inset-0 w-full h-full scale-0 rounded-xl transition-all duration-300 group-hover:scale-100 group-hover:bg-white/10"></div>
              <span className="relative flex items-center justify-center">
                Join Room
                <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>

            <div className="flex items-center justify-center space-x-4 pt-2">
              <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                <Shield className="h-3 w-3 mr-1" />
                Secure
              </div>
              <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                <Zap className="h-3 w-3 mr-1" />
                Low Latency
              </div>
              <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                <Settings className="h-3 w-3 mr-1" />
                Customizable
              </div>
            </div>

            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
              Note: This is a demo application. In a production environment, you would need to configure a Socket.IO
              server.
            </p>
          </div>
        </div>
      ) : (
        <div className="container mx-auto p-4 max-w-6xl">
          <header className="flex items-center justify-between py-4 px-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-500 text-white p-2 rounded-lg">
                <Volume2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Audio Conference</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Connected as { name }</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div
                className={ `px-3 py-1.5 rounded-full text-sm font-medium flex items-center ${ socketStatus === "connected"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                  : socketStatus === "error"
                    ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                    : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300"
                  }` }
              >
                <span
                  className={ `w-2 h-2 rounded-full mr-2 ${ socketStatus === "connected"
                    ? "bg-green-500"
                    : socketStatus === "error"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                    }` }
                ></span>
                { socketStatus === "connected"
                  ? "Connected"
                  : socketStatus === "error"
                    ? "Connection Error"
                    : "Disconnected" }
              </div>
              <div className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-sm font-medium flex items-center">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Room: { room }
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Controls */ }
              <div className="flex flex-wrap gap-3 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <button
                  onClick={ toggleMute }
                  className={ `flex items-center space-x-2 px-5 py-3 rounded-xl font-medium transition ${ muted
                    ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                    }` }
                >
                  { muted ? <MicOff className="h-5 w-5 mr-2" /> : <Mic className="h-5 w-5 mr-2" /> }
                  <span>{ muted ? "Unmute" : "Mute" }</span>
                </button>

                <button
                  onClick={ shareScreen }
                  className="flex items-center space-x-2 px-5 py-3 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded-xl font-medium transition"
                >
                  <Monitor className="h-5 w-5 mr-2" />
                  <span>Share Screen</span>
                </button>

                <button className="flex items-center space-x-2 px-5 py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-xl font-medium transition">
                  <Settings className="h-5 w-5 mr-2" />
                  <span>Settings</span>
                </button>
              </div>

              {/* Shared Screens */ }
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-2 mb-5">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-700 dark:text-emerald-400">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <h2 className="font-semibold text-lg">Shared Screens</h2>
                </div>

                { Object.keys( screens ).length === 0 ? (
                  <div className="text-center py-12 px-6 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                      <Monitor className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mb-2">No screens are currently being shared</p>
                    <button
                      onClick={ shareScreen }
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Share your screen
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    { Object.entries( screens ).map( ( [ user, stream ] ) => (
                      <div
                        key={ user }
                        className="cursor-pointer overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition group shadow-sm hover:shadow-md"
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
                            <div className="bg-white dark:bg-slate-800 rounded-full p-2.5 transform scale-90 group-hover:scale-100 transition-transform">
                              <Monitor className="h-5 w-5 text-blue-500" />
                            </div>
                          </div>
                        </div>
                        <div className="p-3 text-center font-medium bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
                          { user }
                        </div>
                      </div>
                    ) ) }
                  </div>
                ) }
              </div>

              {/* Room Events */ }
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-2 mb-5">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-400">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <h2 className="font-semibold text-lg">Room Events</h2>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 max-h-48 overflow-y-auto">
                  { messageLog.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full mb-3">
                        <MessageSquare className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-slate-500 dark:text-slate-400">No events yet</p>
                    </div>
                  ) : (
                    <ul className="space-y-2.5 text-sm">
                      { messageLog.map( ( log, index ) => (
                        <li key={ index } className="flex items-start bg-white dark:bg-slate-800 p-2.5 rounded-lg">
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono mr-2 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            { log.time }
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
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200 dark:border-slate-700 h-fit">
              <div className="flex items-center space-x-2 mb-5">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-700 dark:text-purple-400">
                  <Users className="h-5 w-5" />
                </div>
                <h2 className="font-semibold text-lg">Participants ({ participants.length + 1 })</h2>
              </div>

              <div className="space-y-3">
                <div
                  className={ `flex items-center p-3.5 rounded-xl transition-all ${ speaking[ "You" ]
                    ? "bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/30 border-l-4 border-green-500"
                    : "bg-slate-50 dark:bg-slate-900"
                    }` }
                >
                  <div
                    className={ `w-10 h-10 rounded-full flex items-center justify-center ${ speaking[ "You" ]
                      ? "bg-gradient-to-br from-green-500 to-green-600 text-white"
                      : "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                      }` }
                  >
                    { name.charAt( 0 ).toUpperCase() }
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="font-medium">You</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{ muted ? "Muted" : "Unmuted" }</p>
                  </div>
                  { speaking[ "You" ] ? (
                    <div className="ml-auto flex space-x-1">
                      <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div className="w-1 h-5 bg-green-500 rounded-full animate-pulse delay-75"></div>
                      <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse delay-150"></div>
                      <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse delay-300"></div>
                    </div>
                  ) : (
                    <div className="ml-auto">
                      { muted ? (
                        <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-full">
                          <MicOff className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        </div>
                      ) : (
                        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                          <Mic className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                      ) }
                    </div>
                  ) }
                </div>

                { participants.map( ( p ) => (
                  <div
                    key={ p.peerId }
                    className={ `flex items-center p-3.5 rounded-xl transition-all ${ speaking[ p.name ]
                      ? "bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/30 border-l-4 border-green-500"
                      : "bg-slate-50 dark:bg-slate-900"
                      }` }
                  >
                    <div
                      className={ `w-10 h-10 rounded-full flex items-center justify-center ${ speaking[ p.name ]
                        ? "bg-gradient-to-br from-green-500 to-green-600 text-white"
                        : "bg-gradient-to-br from-slate-400 to-slate-500 text-white dark:from-slate-600 dark:to-slate-700"
                        }` }
                    >
                      { p.name.charAt( 0 ).toUpperCase() }
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="font-medium">{ p.name }</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Participant</p>
                    </div>
                    { speaking[ p.name ] ? (
                      <div className="ml-auto flex space-x-1">
                        <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <div className="w-1 h-5 bg-green-500 rounded-full animate-pulse delay-75"></div>
                        <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse delay-150"></div>
                        <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse delay-300"></div>
                      </div>
                    ) : (
                      <div className="ml-auto">
                        <div className="p-1.5 bg-slate-200 dark:bg-slate-700 rounded-full">
                          <Mic className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                        </div>
                      </div>
                    ) }
                  </div>
                ) ) }
              </div>

              { participants.length === 0 && (
                <div className="text-center py-6 mt-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full mb-3">
                    <Users className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">Waiting for others to join</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Share the room name with others</p>
                </div>
              ) }
            </div>
          </div>

          {/* Fullscreen view */ }
          { viewScreen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold flex items-center">
                    <Monitor className="h-5 w-5 mr-2 text-emerald-500" />
                    Shared Screen
                  </h3>
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
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                  <button
                    onClick={ () => setViewScreen( null ) }
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-sm font-medium transition"
                  >
                    Close
                  </button>
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