import React from "react";
import {createRoot} from "react-dom/client";
import App from "../../pages/_app";
import Home from "../../pages/index";
createRoot(document.getElementById("root")).render(<App Component={Home} pageProps={{}}/>);
