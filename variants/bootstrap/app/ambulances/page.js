"use client";
import React, { useState } from "react";
import ResourceDirectory from "../../components/ResourceDirectory";
import Link from "next/link";
import { EmergencyIcon } from "../../components/EmergencyIcons";

export default function Ambulances() {
  const [selectedCapability, setSelectedCapability] = useState("all");

  return (
    <div>
      
      

      {/* Directory of Listed Ambulance Providers */}
      <ResourceDirectory
        kind="ambulances"
        title="Ambulance providers"
        label="ambulances"
        intro="Contact listed ambulance providers directly. MedReach displays listed directory contacts and navigation coordinates for Mumbai ambulance fleets."
      />
    </div>
  );
}
