"use strict";

import { Diagnostic } from "@maxfield/node-casl2-core";

export function printDiagnostic(diagnostic: Diagnostic): string {
    return `[casl2] ${diagnostic.messageText} (${diagnostic.line + 1}行目)`;
}
