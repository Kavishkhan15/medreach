import DiagnosticRequestForm from "../../../components/DiagnosticRequestForm";

export const metadata = { title: "Request diagnostic tests", description: "Request diagnostic tests from a selected Mumbai centre and track its response. Appointment and test availability require centre confirmation.", alternates: { canonical: "/diagnostics/request" } };
export default function DiagnosticRequestPage() { return <DiagnosticRequestForm />; }
