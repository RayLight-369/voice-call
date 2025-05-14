import React, { useEffect, useRef, useState } from "react";
import { socket } from "./socket.io";
import Peer from "peerjs";

const App = () => {
  const [ peers, setPeers ] = useState( [] );
  const localStreamRef = useRef( null );
  const peerRef = useRef( null );
  const connectionsRef = useRef( {} );

  useEffect( () => {
    // 1. Connect to socket
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
      // 2. Get local audio stream
      const stream = await navigator.mediaDevices.getUserMedia( { audio: true, video: false } );
      localStreamRef.current = stream;

      // 3. Create PeerJS instance
      const peer = new Peer();
      peerRef.current = peer;

      // 4. Once peer is open, send ID to server
      peer.on( "open", id => {
        console.log( "📞 My Peer ID:", id );
        socket.emit( "peer-id", id );
      } );

      // 5. Listen for incoming calls
      peer.on( "call", call => {
        call.answer( stream );
        call.on( "stream", remoteStream => {
          addAudio( remoteStream );
        } );
      } );

      // 6. Listen for list of users
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

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">🔊 Group Audio Call</h1>
      <p>Open this tab in multiple windows to test group call</p>
    </div>
  );
};

export default App;
