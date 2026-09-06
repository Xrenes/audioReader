import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
export type PDFDocumentProxy = pdfjs.PDFDocumentProxy;
export type PDFPageProxy = pdfjs.PDFPageProxy;

export async function loadDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // pdf.js transfers (and neuters) the buffer — hand it a copy so the
  // original stays usable for caching in IndexedDB.
  const task = pdfjs.getDocument({ data: data.slice(0) });
  return task.promise;
}
