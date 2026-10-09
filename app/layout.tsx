import type {Metadata,Viewport} from "next";
import Script from "next/script";
import "./globals.css";
import "./appearance.css";
import "./dark-override.css";

export const metadata:Metadata={
 title:{default:"UNITY",template:"%s | UNITY"},
 description:"One calm workspace for your projects, knowledge, conversations and authorized tools.",
 applicationName:"UNITY",
 robots:{index:false,follow:false},
 icons:{icon:"/unity-brand/favicon.svg"}
};
export const viewport:Viewport={
 width:"device-width",initialScale:1,viewportFit:"cover",
 colorScheme:"light dark",
 themeColor:[
  {media:"(prefers-color-scheme: light)",color:"#F7F6F2"},
  {media:"(prefers-color-scheme: dark)",color:"#171B20"}
 ]
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en" suppressHydrationWarning>
  <body>
   <Script src="/theme-init.js" strategy="beforeInteractive"/>
   {children}
  </body>
 </html>;
}
