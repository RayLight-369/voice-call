import React, { useEffect, useRef, useState } from "react";
import { socket } from "./socket.io";
import Peer from "peerjs";

const App = () => {
  const [ muted, setMuted ] = useState( false );
  const localStreamRef = useRef( null );
  const peerRef = useRef( null );
  const connectionsRef = useRef( {} );

  useEffect( () => {
    socket.connect();

    socket.on( "connect", () => {
      console.log( "✅ Connected to server:", socket.id );
    } );

    return () => {
      socket.disconnect();
    };
  }, [] );

  useEffect( () => {
    const initPeerAndMedia = async () => {
      const stream = await navigator.mediaDevices.getUserMedia( { audio: true, video: false } );
      localStreamRef.current = stream;

      const peer = new Peer();
      peerRef.current = peer;

      peer.on( "open", id => {
        console.log( "📞 My Peer ID:", id );
        socket.emit( "peer-id", id );
      } );

      peer.on( "call", call => {
        call.answer( stream );
        call.on( "stream", remoteStream => {
          addAudio( remoteStream );
        } );
      } );

      socket.on( "users", userPeerIds => {
        userPeerIds.forEach( peerId => {
          if ( peerId !== peer.id && !connectionsRef.current[ peerId ] ) {
            const call = peer.call( peerId, stream );
            call.on( "stream", remoteStream => {
              addAudio( remoteStream );
            } );
            connectionsRef.current[ peerId ] = call;
          }
        } );
      } );
    };

    initPeerAndMedia();
  }, [] );

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

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">🔊 Group Audio Call</h1>
      <p>Open this tab in multiple windows to test group call</p>
      <button
        onClick={ toggleMute }
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        { muted ? "Unmute Mic" : "Mute Mic" }
      </button>
    </div>
  );
};

export default App;
