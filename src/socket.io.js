import { io } from "socket.io-client";
import { useEffect, useState } from "react";

export const socket = io( "http://localhost:3030", {
  autoConnect: false
} );
