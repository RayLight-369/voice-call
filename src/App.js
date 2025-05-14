import React, { useEffect, useRef, useState } from "react";
import { socket } from "./socket.io";
import Peer from "peerjs";

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
  const videoRefs = useRef( {} ); // For managing video elements dynamically

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
    setMessageLog( ( prev ) => [
      ...prev,
      { message, time: new Date().toLocaleTimeString() },
    ] );
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
    <div className="p-4 space-y-4">
      { !joined ? (
        <div className="space-y-2">
          <input
            placeholder="Your Name"
            className="border p-2 rounded w-full"
            value={ name }
            onChange={ ( e ) => setName( e.target.value ) }
          />
          <input
            placeholder="Room Name"
            className="border p-2 rounded w-full"
            value={ room }
            onChange={ ( e ) => setRoom( e.target.value ) }
          />
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={ noiseCancellation }
              onChange={ ( e ) => setNoiseCancellation( e.target.checked ) }
            />
            <span>Enable Noise Cancellation</span>
          </label>
          <button
            onClick={ handleJoin }
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 w-full"
          >
            Join Room
          </button>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold">🔊 Group Audio Call - Room: { room }</h1>
          <div className="flex gap-2">
            <button
              onClick={ toggleMute }
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              { muted ? "Unmute Mic" : "Mute Mic" }
            </button>
            <button
              onClick={ shareScreen }
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Share Screen
            </button>
          </div>

          <div className="mt-4">
            <h2 className="font-semibold">Participants:</h2>
            <div className="grid grid-cols-5 gap-4">
              { participants.map( ( p ) => (
                <div
                  key={ p.peerId }
                  className={ `px-2 py-1 rounded ${ speaking[ p.name ] ? "border-2 border-green-500 animate-pulse" : "border border-gray-300"
                    }` }
                >
                  { p.name }
                </div>
              ) ) }
              <div
                className={ `px-2 py-1 rounded ${ speaking[ "You" ] ? "border-2 border-green-500 animate-pulse" : "border border-gray-300"
                  }` }
              >
                You
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h2 className="font-semibold">Shared Screens:</h2>
            <div className="grid grid-cols-3 gap-2">
              { Object.entries( screens ).map( ( [ user, stream ] ) => (
                <div
                  key={ user }
                  className="cursor-pointer border rounded overflow-hidden"
                  onClick={ () => setViewScreen( stream ) }
                >
                  <video
                    ref={ ( el ) => {
                      videoRefs.current[ user ] = el;
                    } }
                    autoPlay
                    playsInline
                    muted
                    style={ { width: "100%", height: "auto" } }
                    src={ URL.createObjectURL( stream ) } // Use objectURL for video sources
                  ></video>
                  <div className="text-center text-sm bg-gray-200">{ user }</div>
                </div>
              ) ) }
            </div>
            { viewScreen && (
              <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
                <div className="relative bg-white rounded shadow p-4">
                  <button
                    onClick={ () => setViewScreen( null ) }
                    className="absolute top-2 right-2 text-sm text-red-500"
                  >
                    Close
                  </button>
                  <video
                    src={ URL.createObjectURL( viewScreen ) } // Use objectURL for full-screen view
                    autoPlay
                    playsInline
                    muted
                    style={ { width: "80vw", height: "80vh" } }
                  ></video>
                </div>
              </div>
            ) }
          </div>

          <div className="mt-4">
            <h2 className="font-semibold">Chat Log:</h2>
            <div className="space-y-2">
              { messageLog.map( ( msg, index ) => (
                <div key={ index } className="text-sm">
                  <span className="text-gray-500">{ msg.time } - </span>
                  { msg.message }
                </div>
              ) ) }
            </div>
          </div>
        </>
      ) }
    </div>
  );
};

export default App;
