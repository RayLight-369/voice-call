import { io } from "socket.io-client";
import { useEffect, useState } from "react";

export const socket = io( "https://video-call-server-vvga.onrender.com", {
  autoConnect: false
} );
