import { detailMetadata } from "../../../lib/seo.js";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return detailMetadata("hospital", slug);
}

export default function Layout({ children }) { return children; }
