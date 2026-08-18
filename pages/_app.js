import "../styles/card-layout.css";
import {useRouter} from "next/router";

export default function App({ Component, pageProps }) {
  const router=useRouter();
  const onOptions=router.pathname==="/options";
  return <>
    <div className="appSwitcher">
      <a href="/" className={!onOptions?"active":""}>Stocks</a>
      <a href="/options" className={onOptions?"active":""}>Options</a>
    </div>
    <Component {...pageProps} />
    <style jsx global>{`.appSwitcher{max-width:1440px;margin:0 auto;padding:12px 18px 0;display:flex;gap:6px}.appSwitcher a{display:inline-block;border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#53657f;text-decoration:none;padding:7px 12px;font:800 13px Inter,Arial,sans-serif}.appSwitcher a.active{background:#111827;color:#fff;border-color:#111827}@media(max-width:650px){.appSwitcher{padding:10px 10px 0}}`}</style>
  </>;
}
