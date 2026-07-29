"use client";

import { use, useEffect, useState } from "react";
import { getAgencyLocations, getKnowledgeDocuments, upsertKnowledgeDocument, deleteKnowledgeDocument, upsertAgencyLocation } from "@/lib/services/knowledgeService";
import type { AgencyLocation, KnowledgeDocument, KnowledgeType } from "@/lib/types/agency";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { Loader2, Plus, Edit2, Trash2, Database, MapPin } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { useI18n } from "@/lib/i18n-context";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface PageProps {
  params: Promise<{ agencyId: string }>;
}

export default function AgencyKnowledgePage({ params }: PageProps) {
  const { agencyId } = use(params);
  const { t } = useI18n();

  const [locations, setLocations] = useState<AgencyLocation[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({ city: "", slug: "", countryCode: "TR" });

  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [newDoc, setNewDoc] = useState<Partial<KnowledgeDocument>>({
    title: "", knowledgeType: "destination", content: "", locale: "en", locationId: ""
  });

  async function fetchData() {
    setLoading(true);
    try {
      const locs = await getAgencyLocations(agencyId);
      const docs = await getKnowledgeDocuments(agencyId, "agency", agencyId);
      setLocations(locs);
      setDocuments(docs);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, [agencyId]);

  async function handleAddLocation() {
    if (!newLocation.city || !newLocation.slug) return;
    await upsertAgencyLocation({ ...newLocation, agencyId, active: true, displayOrder: locations.length * 10 });
    setIsAddLocationOpen(false);
    fetchData();
  }

  async function handleAddDoc() {
    if (!newDoc.title || !newDoc.content) return;
    await upsertKnowledgeDocument({
      ...newDoc,
      tenantId: agencyId,
      ownerType: "agency",
      ownerId: agencyId,
      status: "active",
      sourceType: "manual"
    } as any);
    setIsAddDocOpen(false);
    fetchData();
  }

  async function handleDeleteDoc(id: string) {
    if (confirm("Are you sure?")) {
      await deleteKnowledgeDocument(id, agencyId);
      fetchData();
    }
  }

  if (loading) return <div style={{ padding: 20 }}><Loader2 className="animate-spin" /></div>;

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: UI_COLORS.textPrimary }}>AI Bilgi Havuzu (Agency)</h1>
          <p style={{ margin: 0, fontSize: 13, color: UI_COLORS.textMuted }}>Manage agency-level knowledge and destinations.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={() => setIsAddLocationOpen(true)}>
            <MapPin size={14} style={{ marginRight: 6 }} /> Add Location
          </Button>
          <Button variant="primary" onClick={() => setIsAddDocOpen(true)}>
            <Plus size={14} style={{ marginRight: 6 }} /> Add Document
          </Button>
        </div>
      </div>

      {/* Locations */}
      <div style={{ background: "#ffffff", border: `1px solid #e2e8f0`, borderRadius: 8, padding: 15 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 10px 0" }}>Destinations (Locations)</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {locations.map(loc => (
            <Badge key={loc.id} label={loc.city} variant="default" />
          ))}
          {locations.length === 0 && <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>No locations found.</span>}
        </div>
      </div>

      {/* Documents */}
      <div style={{ background: "#ffffff", border: `1px solid #e2e8f0`, borderRadius: 8, padding: 15 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 10px 0" }}>Knowledge Documents</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid #e2e8f0`, textAlign: "left", color: UI_COLORS.textSecondary }}>
              <th style={{ padding: 10 }}>Title</th>
              <th style={{ padding: 10 }}>Type</th>
              <th style={{ padding: 10 }}>Locale</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map(doc => (
              <tr key={doc.id} style={{ borderBottom: `1px solid #e2e8f0` }}>
                <td style={{ padding: 10, fontWeight: 500 }}>{doc.title}</td>
                <td style={{ padding: 10 }}>{doc.knowledgeType}</td>
                <td style={{ padding: 10 }}>{doc.locale.toUpperCase()}</td>
                <td style={{ padding: 10 }}>
                  <Badge label={doc.status} variant={doc.status === "active" ? "success" : "default"} />
                </td>
                <td style={{ padding: 10, textAlign: "right" }}>
                  <Button variant="secondary" onClick={() => handleDeleteDoc(doc.id!)}>
                    <Trash2 size={14} color="#ef4444" />
                  </Button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 10, textAlign: "center", color: UI_COLORS.textMuted }}>No documents found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Location Modal */}
      <Modal isOpen={isAddLocationOpen} onClose={() => setIsAddLocationOpen(false)} title="Add Location">
        <div style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 15 }}>
          <Input label="City Name" value={newLocation.city} onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })} />
          <Input label="Slug" value={newLocation.slug} onChange={(e) => setNewLocation({ ...newLocation, slug: e.target.value })} />
          <Button variant="primary" onClick={handleAddLocation}>Save Location</Button>
        </div>
      </Modal>

      {/* Add Doc Modal */}
      <Modal isOpen={isAddDocOpen} onClose={() => setIsAddDocOpen(false)} title="Add Document">
        <div style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 15 }}>
          <Input label="Title" value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} />
          
          <label style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Type</label>
          <select value={newDoc.knowledgeType} onChange={(e) => setNewDoc({ ...newDoc, knowledgeType: e.target.value as KnowledgeType })} style={{ padding: 8, borderRadius: 6, border: `1px solid #e2e8f0` }}>
            <option value="about_agency">About Agency</option>
            <option value="destination">Destination</option>
            <option value="patient_process">Patient Process</option>
            <option value="faq">FAQ</option>
          </select>

          {newDoc.knowledgeType === "destination" && (
            <>
              <label style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Location</label>
              <select value={newDoc.locationId || ""} onChange={(e) => setNewDoc({ ...newDoc, locationId: e.target.value })} style={{ padding: 8, borderRadius: 6, border: `1px solid #e2e8f0` }}>
                <option value="">Select Location...</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.city}</option>)}
              </select>
            </>
          )}

          <label style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Content</label>
          <textarea 
            value={newDoc.content} 
            onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
            style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 6, border: `1px solid #e2e8f0` }}
          />

          <Button variant="primary" onClick={handleAddDoc}>Save Document</Button>
        </div>
      </Modal>
    </div>
  );
}
