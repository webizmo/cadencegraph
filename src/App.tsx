import { Studio } from "./editor/Studio";
import { RenderPage } from "./render/RenderPage";
export default function App() {
  return new URLSearchParams(window.location.search).has("render") ? (
    <RenderPage />
  ) : (
    <Studio />
  );
}
