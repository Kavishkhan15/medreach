import { pageMetadata } from "../../../lib/seo.js";

// References and tracking credentials never enter document metadata.
export const metadata = pageMetadata("/requests", { title: "Healthcare Request Details", description: "Review your authorised healthcare request details and coordination status." });
export default function Layout({ children }) { return children; }
