export default function ApiDown({ msg }: { msg: string }) {
  return (
    <div className="card mx-auto max-w-xl text-center">
      <p className="text-3xl">🛰️</p>
      <h1 className="h2 mt-2">Could not reach the API</h1>
      <p className="mt-2 text-sm text-muted">{msg}</p>
      <pre className="mt-3 rounded-lg bg-panel-2 p-3 text-left text-xs">python tasks.py api</pre>
    </div>
  );
}
