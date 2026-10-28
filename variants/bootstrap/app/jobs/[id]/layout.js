import { detailMetadata } from "../../../lib/seo.js";

export async function generateMetadata({ params }) {
  const { id } = await params;
  return detailMetadata("job", id);
}

export default function Layout({ children }) { return children; }
