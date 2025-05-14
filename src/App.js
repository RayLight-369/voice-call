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

  const localStreamRef = useRef( null );
  const peerRef = useRef( null );
  const connectionsRef = useRef( {} );
  const audioAnalyzersRef = useRef( {} );

  useEffect( () => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [] );

  useEffect( () => {
    if ( !joined ) return;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia( { audio: true } );
        localStreamRef.current = stream;

        detectSpeech( "You", stream );

        const peer = new Peer();
        peerRef.current = peer;

        peer.on( "open", id => {
          socket.emit( "join-room", { name, room, peerId: id } );
        } );

        peer.on( "call", call => {
          call.answer( stream );
          call.on( "stream", remoteStream => {
            addAudio( call.metadata?.name || "Unknown", remoteStream );
          } );
        } );

        socket.on( "users-in-room", users => {
          setParticipants( users );

          users.forEach( user => {
            if ( user.peerId === peer.id ) return;
            if ( !connectionsRef.current[ user.peerId ] ) {
              const call = peer.call( user.peerId, stream, { metadata: { name } } );
              call.on( "stream", remoteStream => {
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
  }, [ joined ] );

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
      setSpeaking( prev => ( { ...prev, [ id ]: avg > 20 } ) );
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

  const handleJoin = () => {
    if ( name.trim() && room.trim() ) {
      setJoined( true );
    }
  };

  const logEvent = message => {
    setMessageLog( prev => [ ...prev, { message, time: new Date().toLocaleTimeString() } ] );
  };

  const showNotification = text => {
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
            onChange={ e => setName( e.target.value ) }
          />
          <input
            placeholder="Room Name"
            className="border p-2 rounded w-full"
            value={ room }
            onChange={ e => setRoom( e.target.value ) }
          />
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
          <button
            onClick={ toggleMute }
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            { muted ? "Unmute Mic" : "Mute Mic" }
          </button>

          <div className="mt-4">
            <h2 className="font-semibold">Participants:</h2>
            <div className="grid grid-cols-5 gap-4">
              { participants.map( p => (
                <div
                  key={ p.peerId }
                  className={ `px-2 py-1 rounded ${ speaking[ p.name ] ? "border-2 border-green-500 animate-pulse" : "border border-gray-300" }` }
                >
                  { p.name }
                </div>
              ) ) }
              <div
                className={ `px-2 py-1 rounded ${ speaking[ "You" ] ? "border-2 border-green-500 animate-pulse" : "border border-gray-300" }` }
              >
                You
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h2 className="font-semibold">Room Events:</h2>
            <ul className="bg-gray-100 p-2 rounded max-h-48 overflow-y-auto text-sm">
              { messageLog.map( ( log, index ) => (
                <li key={ index }>
                  [{ log.time }] { log.message }
                </li>
              ) ) }
            </ul>
          </div>
        </>
      ) }
    </div>
  );
};

export default App;
