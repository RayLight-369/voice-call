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
  const localStreamRef = useRef( null );
  const peerRef = useRef( null );
  const connectionsRef = useRef( {} );

  useEffect( () => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [] );

  useEffect( () => {
    if ( !joined ) return;

    const initPeerAndMedia = async () => {
      const stream = await navigator.mediaDevices.getUserMedia( { audio: true } );
      localStreamRef.current = stream;

      const peer = new Peer();
      peerRef.current = peer;

      peer.on( "open", id => {
        socket.emit( "join-room", { name, room, peerId: id } );
      } );

      peer.on( "call", call => {
        call.answer( stream );
        call.on( "stream", remoteStream => {
          addAudio( remoteStream );
        } );
      } );

      socket.on( "users-in-room", users => {
        setParticipants( users );
      } );

      socket.on( "user-joined", ( { name } ) => {
        logEvent( `${ name } joined the room` );
        showNotification( `${ name } joined the room` );
      } );

      socket.on( "user-left", ( { name } ) => {
        logEvent( `${ name } left the room` );
        showNotification( `${ name } left the room` );
      } );

      requestNotificationPermission();
    };

    initPeerAndMedia();
  }, [ joined ] );

  const logEvent = ( message ) => {
    setMessageLog( prev => [ ...prev, { message, time: new Date().toLocaleTimeString() } ] );
  };

  const showNotification = ( text ) => {
    if ( document.hidden && Notification.permission === "granted" ) {
      new Notification( text );
    }
  };

  const requestNotificationPermission = () => {
    if ( "Notification" in window && Notification.permission !== "granted" ) {
      Notification.requestPermission();
    }
  };

  const addAudio = stream => {
    const audio = document.createElement( "audio" );
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.playsInline = true;
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

  return (
    <div className="p-4 space-y-4">
      { !joined ? (
        <div className="space-y-2">
          <input
            placeholder="Your Name"
            className="border p-2 rounded"
            value={ name }
            onChange={ e => setName( e.target.value ) }
          />
          <input
            placeholder="Room Name"
            className="border p-2 rounded"
            value={ room }
            onChange={ e => setRoom( e.target.value ) }
          />
          <button
            onClick={ handleJoin }
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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
            <ul className="list-disc ml-6">
              { participants.map( p => (
                <li key={ p.peerId }>{ p.name }</li>
              ) ) }
            </ul>
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
