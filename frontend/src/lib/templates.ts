export const CODE_TEMPLATES: Record<string, string> = {
  python: `print("Hello CodeForge!")

name = "Developer"
print(f"Welcome, {name}!")
`,

  c: `#include <stdio.h>

int main() {
    printf("Hello CodeForge!\\n");
    printf("Running C in Docker sandbox\\n");
    return 0;
}
`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello CodeForge!" << endl;
    cout << "Running C++ in Docker sandbox" << endl;
    return 0;
}
`,

  javascript: `console.log("Hello CodeForge!");
console.log("Running JavaScript in Docker sandbox");
`,

  php: `<?php
echo "Hello CodeForge!\\n";
echo "Running PHP in Docker sandbox\\n";
`,

  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello CodeForge!");
        System.out.println("Running Java in Docker sandbox");
    }
}
`,

  assembly: `; NASM x86-64 Assembly
section .data
    msg db 'Hello CodeForge!', 0xa
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
    syscall
`,
};
