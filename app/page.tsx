// Landing. Server part: reads the public reservoir and news data at build time; the screen is components/home/Landing.tsx.
import { Landing } from "@/components/home/Landing";
import { publicData } from "@/components/home/public-data";

export default function Home() {
  return <Landing info={publicData()} />;
}
