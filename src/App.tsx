import { useReaderStore } from './store/readerStore';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import './app.css';

export function App() {
  const docId = useReaderStore((s) => s.docId);
  return <div className="app">{docId ? <Reader /> : <Library />}</div>;
}
