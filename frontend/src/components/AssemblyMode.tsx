'use client';

import { motion } from 'framer-motion';
import { Cpu, Copy, Code2 } from 'lucide-react';

const EXAMPLES = [
  {
    name: 'Hello World',
    code: `section .data
    msg db 'Hello, Cyber Classes Sirsa!', 0xa
    len equ $ - msg

section .text
    global _start

_start:
    mov rax, 1
    mov rdi, 1
    mov rsi, msg
    mov rdx, len
    syscall

    mov rax, 60
    xor rdi, rdi
    syscall`,
  },
  {
    name: 'Add Two Numbers',
    code: `section .data
    num1 dq 42
    num2 dq 58
    result dq 0

section .text
    global _start

_start:
    mov rax, [num1]
    add rax, [num2]
    mov [result], rax

    mov rax, 60
    xor rdi, rdi
    syscall`,
  },
];

export default function AssemblyMode({ onSelectCode }: { onSelectCode: (code: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-lg border border-white/5 p-4 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-5 h-5 text-accent-400" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Assembly Mode (NASM x86-64)</h3>
      </div>

      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Write NASM-style x86-64 assembly code. The assembler compiles and links using
        <code className="text-accent-400 mx-1">nasm</code> and
        <code className="text-accent-400 mx-1">ld</code> in a sandboxed environment.
      </p>

      <div className="space-y-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Examples</span>
        {EXAMPLES.map((example) => (
          <button
            key={example.name}
            onClick={() => onSelectCode(example.code)}
            className="w-full flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 rounded-lg hover:bg-white/[0.06] hover:border-white/10 transition-all group"
          >
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-accent-400" />
              <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">{example.name}</span>
            </div>
            <Copy className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}
