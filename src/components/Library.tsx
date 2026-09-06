import { useEffect, useRef, useState } from 'react';
import { listPdfs, savePdf, deletePdf } from '@/storage/db';
import { loadDocument } from '@/pdf/pdfSetup';
import { useReaderStore } from '@/store/readerStore';
import './library.css';

interface Row {
  id: string;
  title: string;
  numPages: number;
  lastOpenedAt: number;
}

export function Library() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const openDoc = useReaderStore((s) => s.openDoc);

  const refresh = () =>
    listPdfs().then((all) =>
      setRows(all.map((r) => ({ id: r.id, title: r.title, numPages: r.numPages, lastOpenedAt: r.lastOpenedAt }))),
    );

  useEffect(() => {
    void refresh();
  }, []);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await loadDocument(bytes);
      const id = crypto.randomUUID();
      const title = file.name.replace(/\.pdf$/i, '');
      await savePdf(id, title, bytes, doc.numPages);
      await refresh();
      openDoc(id, title, doc.numPages);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library">
      <header className="lib-header glass glass-lit">
        <h1>Audio Reader</h1>
        <p>Select a passage. Hear it read calmly, in English or Bangla.</p>
      </header>

      <button
        className="lib-add glass glass-lit"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <span className="lib-add-plus">＋</span>
        <span>{busy ? 'Opening…' : 'Open a PDF'}</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      <ul className="lib-list">
        {rows.map((r) => (
          <li key={r.id} className="lib-item glass">
            <button className="lib-item-main" onClick={() => openDoc(r.id, r.title, r.numPages)}>
              <span className="lib-item-title">{r.title}</span>
              <span className="lib-item-meta">{r.numPages} pages</span>
            </button>
            <button
              className="lib-item-del"
              aria-label="Remove"
              onClick={async () => {
                await deletePdf(r.id);
                void refresh();
              }}
            >
              ✕
            </button>
          </li>
        ))}
        {!rows.length && (
          <li className="lib-empty">
            <span className="lib-empty-icon">◇</span>
            <span className="lib-empty-title">No documents yet</span>
            <span className="lib-empty-body">
              Open a PDF above. It’s saved on this device and opens offline next time.
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
