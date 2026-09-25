import Link from "next/link";
import { EmergencyIcon } from "./EmergencyIcons";

export default function EmergencyHospitalCard({ hospital, category }) {
  const coords = hospital.location?.coordinates || [];
  const hasCoords = coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
  const emergencyPhone = hospital.emergencyPhone || hospital.phone || "112";

  const requestUrl = `/requests/new?hospital=${hospital._id || hospital.slug}&isEmergency=true&flow=emergency&emergencyType=${encodeURIComponent(
    category?.id || "general"
  )}&facility=Emergency%20Department`;

  return (
    <div className="bg-white rounded-lg border-2 border-red-500 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="bg-red-50 text-red-700 py-2 px-3 flex justify-between items-center border-b border-red-100">
        <span className="font-bold text-xs flex items-center gap-1.5 text-red-700">
          <EmergencyIcon name="siren" size={16} /> Emergency Facility
        </span>
        {category && (
          <span className="bg-red-600 text-white text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1">
            <EmergencyIcon name={category.id} size={14} /> {category.label} Match
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          <Link className="hover:text-red-600 transition-colors" href={`/hospitals/${hospital.slug}?flow=emergency`}>
            {hospital.name}
          </Link>
        </h3>

        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
          <EmergencyIcon name="pin" size={14} className="text-gray-400 shrink-0" />
          <span>
            {hospital.address || hospital.locality || hospital.city || "Mumbai"}
            {hospital.hospitalType ? ` · ${hospital.hospitalType}` : ""}
          </span>
        </p>

        {hospital.specialties?.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {hospital.specialties.slice(0, 3).map((s) => (
              <span key={s} className="bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded border border-gray-200">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-gray-100 flex flex-col gap-2">
          <div className="flex gap-2">
            <a
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-3 rounded flex-1 flex items-center justify-center gap-1 transition-colors"
              href={`tel:${emergencyPhone}`}
            >
              <EmergencyIcon name="phone" size={16} /> Call {emergencyPhone}
            </a>

            {hasCoords && (
              <a
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold py-2 px-3 rounded flex-1 flex items-center justify-center gap-1 transition-colors"
                href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <EmergencyIcon name="navigate" size={16} /> Navigate
              </a>
            )}
          </div>

          <Link
            className="bg-amber-400 hover:bg-amber-500 text-gray-900 text-xs font-bold py-2 px-3 rounded text-center flex items-center justify-center gap-1.5 transition-colors"
            href={requestUrl}
          >
            <EmergencyIcon name="bed" size={18} /> Request Emergency Bed
          </Link>

          <div className="text-right">
            <Link href={`/hospitals/${hospital.slug}?flow=emergency`} className="text-xs text-gray-400 hover:text-gray-600">
              View Full Details →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
