export const CODE_TEMPLATES: Record<string, string> = {
  python: `print("Hello from Cyber Classes Sirsa!")

name = "Developer"
print(f"Welcome, {name}! Learn - Build - Secure")
`,

  c: `#include <stdio.h>

int main() {
    printf("Hello from Cyber Classes Sirsa!\\n");
    printf("Learn - Build - Secure\\n");
    return 0;
}
`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello from Cyber Classes Sirsa!" << endl;
    cout << "Learn - Build - Secure" << endl;
    return 0;
}
`,

  javascript: `console.log("Hello from Cyber Classes Sirsa!");
console.log("Learn - Build - Secure");
`,

  php: `<?php
echo "Hello from Cyber Classes Sirsa!\\n";
echo "Learn - Build - Secure\\n";
`,

  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Cyber Classes Sirsa!");
        System.out.println("Learn - Build - Secure");
    }
}
`,

  assembly: `; NASM x86-64 Assembly
section .data
    msg db 'Hello from Cyber Classes Sirsa!', 0xa
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
