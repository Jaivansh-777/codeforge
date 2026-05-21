'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Binary, RotateCcw, Copy, ArrowRight } from 'lucide-react';
import { convertBinary } from '@/lib/api';
import type { BinaryResponse } from '@/lib/types';

export default function BinaryMode() {
  const [binary, setBinary] = useState('');
  const [result, setResult] = useState<BinaryResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConvert = async () => {
    const cleaned = binary.replace(/\s/g, '');
    if (!cleaned) {
      setError('Please enter a binary string');
      return;
    }
    if (!/^[01]+$/.test(cleaned)) {
      setError('Only 0 and 1 characters are allowed');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await convertBinary(cleaned);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyResult = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleConvert();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-lg border border-white/5 p-4 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Binary className="w-5 h-5 text-accent-400" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Binary Mode</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Enter Binary String</label>
          <input
            type="text"
            value={binary}
            onChange={(e) => {
              const val = e.target.value.replace(/[^01\s]/g, '');
              setBinary(val);
              setResult(null);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. 01001000 01100101 01101100 01101100 01101111"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-gray-200 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 transition-all placeholder:text-gray-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleConvert}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            Convert
          </button>
          <button
            onClick={() => { setBinary(''); setResult(null); setError(''); }}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-sm rounded-lg transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
          >
            {error}
          </motion.p>
        )}

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Results</span>
              <button onClick={copyResult} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Decimal', value: result.decimal },
                { label: 'Hexadecimal', value: result.hex },
                { label: 'Octal', value: result.octal },
                { label: 'Length', value: `${result.length} bits` },
                { label: 'Bytes', value: result.bytes.toString() },
                { label: 'Nibbles', value: result.nibbles.toString() },
              ].map((item) => (
                <div key={item.label} className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2.5">
                  <span className="text-xs text-gray-500 block mb-0.5">{item.label}</span>
                  <span className="text-sm font-mono text-gray-200 font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            {result.ascii && (
              <div className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2.5">
                <span className="text-xs text-gray-500 block mb-0.5">ASCII</span>
                <span className="text-sm font-mono text-emerald-400 font-medium">{result.ascii}</span>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
