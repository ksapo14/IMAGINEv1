import { redirect } from "next/navigation";

/** Preserve existing bookmarks while retiring the Canvas workspace. */
export default function CanvasPage() {
  redirect("/pitch");
}
