import React, { useEffect } from 'react';
import { socket } from './socket.io';

const App = () => {

  useEffect( () => {
    socket.connect();

    socket.on( "connect", () => {
      console.log( "✅ Connected to server:", socket.id );
    } );


    return () => {
      socket.off( "connect" );
      socket.disconnect();
    };
  }, [] );



  return (
    <button>App</button>
  );
};

export default App;