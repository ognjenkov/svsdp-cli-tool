#!/usr/bin/env node
import { XMLSerializer, DOMParser } from "xmldom";
import fs from "fs";
import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import archiver from "archiver";
import yaml from "js-yaml";
import xpath from "xpath";
const nsResolver = {
    lookupNamespaceURI: (prefix) => {
        const namespaces = {
            bpmn: "http://www.omg.org/spec/BPMN/20100524/MODEL",
            bpmndi: "http://www.omg.org/spec/BPMN/20100524/DI",
            dc: "http://www.omg.org/spec/DD/20100524/DC",
            di: "http://www.omg.org/spec/DD/20100524/DI",
            camunda: "http://camunda.org/schema/1.0/bpmn",
            xsi: "http://www.w3.org/2001/XMLSchema-instance",
            modeler: "http://camunda.org/schema/modeler/1.0",
            sistemiv: "http://sistemiv.com/schema/1.0",
        };
        return namespaces[prefix] || null;
    },
};
const packageCommand = {
    command: "svsdp package <folder>",
    describe: "Zip the provided folder into a .svsdp package",
    builder: (yargs) => {
        return yargs
            .positional("folder", {
            describe: "Path to the folder you want to zip",
            type: "string",
            demandOption: true,
        })
            .option("env", {
            alias: "e",
            describe: `\nEnvironment of the bpmn modification file: bpmn.<env>.yaml;\nYou must hava a .bpmn file that matches the folder name: <folder>.bpmn;\nThe bpmn.<env>.yaml file must be in format:\nmodifications:\n••-•action:•"valid action"\n••••target:•"valid xpath"\n••••value:•"string"\n••-•action:...\n\nLEGEND:\n\n• -> represents space (whitespace)\n\nValid action is: addAttribute | addElement | addText | replace | remove\n`,
            type: "string",
            default: undefined,
        });
    },
    handler: (argv) => {
        const inputPath = path.resolve(argv.folder);
        const folderName = path.basename(inputPath);
        const outputPath = path.resolve(process.cwd(), `${folderName}.svsdp`);
        const env = argv.env;
        if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isDirectory()) {
            console.error(`❌ Folder not found: ${inputPath}`);
            process.exit(1);
        }
        if (env) {
            console.log(`🌐 Loading the environment`);
            const envPath = path.join(inputPath, "bpmn." + env + ".yaml");
            if (!fs.existsSync(envPath)) {
                console.error(`❌ Environment file not found: ${envPath}`);
                process.exit(1);
            }
            const envFile = fs.readFileSync(envPath, "utf-8");
            const envData = yaml.load(envFile);
            if (!validateBpmnEnvModifications(envData)) {
                // ostalo je value da se proveri u zavisnosti od action
                console.error(`❌ Invalid environment file: ${envPath}`);
                process.exit(1);
            }
            const bpmnPath = path.join(inputPath, folderName + ".bpmn");
            if (!fs.existsSync(bpmnPath)) {
                console.error(`❌ .bpmn file not found: ${bpmnPath}`);
                process.exit(1);
            }
            const bpmnXml = fs.readFileSync(bpmnPath, "utf-8");
            const doc = new DOMParser().parseFromString(bpmnXml, "text/xml");
            envData.modifications.forEach((mod) => {
                console.log(`📝 Altering the .bpmn file`);
                if (mod.action === "remove") {
                    const removeResult = removeNode(doc, mod.target, nsResolver);
                    //TODO mozda da proverim success ali nebitno je
                }
                else if (mod.action === "addElement") {
                    if (!mod.value ||
                        mod.value.length === 0 ||
                        typeof mod.value !== "string") {
                        console.error("❌ Value is required for addElement action");
                        process.exit(1);
                    }
                    const addElementResult = addElement(doc, mod.target, mod.value, nsResolver);
                    if (!addElementResult.success) {
                        console.error("❌ Failed to addElement");
                        process.exit(1);
                    }
                }
                else if (mod.action === "addText") {
                    if (!mod.value ||
                        mod.value.length === 0 ||
                        typeof mod.value !== "string") {
                        console.error("❌ Value is required for addText action");
                        process.exit(1);
                    }
                    const addTextResult = addText(doc, mod.target, mod.value, nsResolver);
                    if (!addTextResult.success) {
                        console.error("❌ Failed to AddText");
                        process.exit(1);
                    }
                }
                else if (mod.action === "addAttribute") {
                    if (!mod.value ||
                        mod.value.length === 0 ||
                        typeof mod.value !== "string") {
                        console.error("❌ Value is required for addAttribute action");
                        process.exit(1);
                    }
                    const addAttributeResult = addAttribute(doc, mod.target, mod.value, "", nsResolver);
                    if (!addAttributeResult.success) {
                        console.error("❌ Failed to addAttribute");
                        process.exit(1);
                    }
                }
                else if (mod.action === "replace") {
                    if (!mod.value ||
                        mod.value.length === 0 ||
                        typeof mod.value !== "string") {
                        console.error("❌ Value is required for replace action");
                        process.exit(1);
                    }
                    const replaceResult = replaceNodeValue(doc, mod.target, mod.value, nsResolver);
                    if (!replaceResult.success) {
                        console.error("❌ Failed to replace node");
                        process.exit(1);
                    }
                }
            });
            const updatedXml = new XMLSerializer().serializeToString(doc);
            fs.writeFileSync(bpmnPath, updatedXml, "utf-8");
            console.log(`💾 Saved modified .bpmn file`);
        }
        if (fs.existsSync(outputPath)) {
            fs.rmSync(outputPath);
            console.log(`🗑️ Removed existing .svsdp file`);
        }
        console.log(`📦 Creating package .svsdp`);
        try {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver("zip", { zlib: { level: 5 } });
            output.on("close", () => {
                console.log(`✅ Done: ${outputPath}`);
            });
            archive.on("error", (err) => {
                throw err;
            });
            archive.pipe(output);
            archive.directory(inputPath, false, (entry) => {
                const relativeOutputPath = path.relative(inputPath, outputPath);
                if (entry.name === relativeOutputPath) {
                    return false; // Exclude the output .svsdp file from being included
                }
                return entry;
            });
            archive.finalize();
        }
        catch (err) {
            console.error(`❌ Failed to create .svsdp file`);
            console.error(err);
            process.exit(1);
        }
    },
};
yargs(hideBin(process.argv))
    .command(packageCommand)
    .demandCommand()
    .help()
    .wrap(null)
    .parse();
function validateBpmnEnvModifications(// ovo proveri action da li je ok i target da li je ok, value proveravam kasnije
envData) {
    if (typeof envData !== "object" ||
        envData === null ||
        !Array.isArray(envData.modifications)) {
        return false;
    }
    for (const mod of envData.modifications) {
        if (typeof mod.action !== "string" ||
            !["remove", "addAttribute", "addElement", "addText", "replace"].includes(mod.action) ||
            typeof mod.target !== "string" ||
            !isValidXPath(mod.target)) {
            return false;
        }
    }
    return true;
}
// function removeNode(doc: Document, xpathExpr: string) {
//   const nodes = xpath.selectWithResolver(xpathExpr, doc, nsResolver) as Node[];
//   if (nodes.length === 0) {
//     console.error(`❌ Node not found: ${xpathExpr}`);
//     process.exit(1);
//   }
//   if (nodes.length > 1) {
//     console.info(`⚠️ Multiple nodes will be removed`);
//   }
//   for (const node of nodes) {
//     if (node && node.parentNode) {
//       node.parentNode.removeChild(node);
//     }
//   }
// }
function replaceNodeValue(doc, xpathExpr, newValue, nsResolver) {
    const nodes = xpath.selectWithResolver(xpathExpr, doc, nsResolver);
    if (nodes.length === 0) {
        console.error(`❌ Node not found: ${xpathExpr}`);
        return { success: false, modifiedCount: 0 };
    }
    let modifiedCount = 0;
    for (const node of nodes) {
        try {
            const parent = node.parentNode;
            if (!parent && node.nodeType !== 2) {
                console.warn(`⚠️ Node has no parent, cannot replace`);
                continue;
            }
            switch (node.nodeType) {
                case 1: // Element Node
                    const parsed = new DOMParser().parseFromString(`<wrapper>${newValue}</wrapper>`, "text/xml");
                    const newNodes = Array.from(parsed.documentElement.childNodes);
                    if (newNodes.length === 0) {
                        throw new Error("No valid content provided");
                    }
                    // Handle multiple children in the parent
                    if (parent.childNodes.length > 1) {
                        // Replace just the target node while preserving siblings
                        parent.replaceChild(newNodes.length === 1
                            ? newNodes[0]
                            : doc.createDocumentFragment(), node);
                        // If multiple nodes were provided, insert them all
                        if (newNodes.length > 1) {
                            const fragment = doc.createDocumentFragment();
                            newNodes.forEach((n) => fragment.appendChild(n.cloneNode(true)));
                            parent.insertBefore(fragment, node.nextSibling);
                        }
                    }
                    else {
                        // Simple replacement for single-child parents
                        parent.replaceChild(newNodes.length === 1
                            ? newNodes[0]
                            : doc.createDocumentFragment(), node);
                    }
                    modifiedCount++;
                    break;
                case 2: // Attribute Node
                    node.value = newValue;
                    modifiedCount++;
                    break;
                case 3: // Text Node
                    // For text nodes in elements with multiple children
                    if (parent.childNodes.length > 1) {
                        const newText = doc.createTextNode(newValue);
                        parent.replaceChild(newText, node);
                    }
                    else {
                        node.data = newValue;
                    }
                    modifiedCount++;
                    break;
                default:
                    console.warn(`⚠️ Unsupported node type: ${node.nodeType}`);
            }
        }
        catch (error) {
            console.error(`❌ Failed to replace node:`, error instanceof Error ? error.message : error);
        }
    }
    return {
        success: modifiedCount === nodes.length,
        modifiedCount,
    };
}
function isValidXPath(xpathExpression) {
    try {
        const dummyDoc = new DOMParser().parseFromString("<root/>", "text/xml");
        xpath.selectWithResolver(xpathExpression, dummyDoc, nsResolver);
        return true;
    }
    catch (error) {
        return false;
    }
}
function isXmlValid(xmlString, nsResolver) {
    try {
        const doc = new DOMParser().parseFromString(xmlString, "text/xml");
        // Check for parser errors
        if (doc.getElementsByTagName("parsererror").length > 0) {
            return false;
        }
        // Test namespace resolution if resolver provided
        if (nsResolver) {
            xpath.selectWithResolver("//*", doc, nsResolver);
        }
        return true;
    }
    catch {
        return false;
    }
}
function ensureElementNodes(nodes, xpathExpr) {
    const elements = nodes.filter((n) => n.nodeType === 1);
    if (elements.length !== nodes.length) {
        const invalidTypes = [
            ...new Set(nodes.filter((n) => n.nodeType !== 1).map((n) => n.nodeType)),
        ];
        console.warn(`⚠️ XPath "${xpathExpr}" matched non-element nodes (types ${invalidTypes.join(", ")}). Only element nodes will be modified.`);
    }
    return elements;
}
export function addElement(doc, xpathExpr, elementXml, nsResolver) {
    const nodes = xpath.selectWithResolver(xpathExpr, doc, nsResolver);
    const parents = ensureElementNodes(nodes, xpathExpr);
    if (parents.length === 0) {
        console.error(`❌ No valid parent elements found for: ${xpathExpr}`);
        return { success: false, addedCount: 0 };
    }
    // Validate and parse new element
    const wrapper = new DOMParser().parseFromString(`<wrapper xmlns:ns="http://example.com">${elementXml}</wrapper>`, "text/xml");
    const newNodes = Array.from(wrapper.documentElement.childNodes);
    if (newNodes.length === 0 || !newNodes.every((n) => n.nodeType === 1)) {
        console.error(`❌ Invalid element XML: Must contain at least one element node`);
        return { success: false, addedCount: 0 };
    }
    let addedCount = 0;
    for (const parent of parents) {
        try {
            // Convert self-closing elements if needed
            if (/\/>$/.test(parent.toString())) {
                parent.appendChild(doc.createTextNode(""));
            }
            newNodes.forEach((node) => {
                const imported = doc.importNode(node, true);
                parent.appendChild(imported);
                addedCount++;
            });
        }
        catch (error) {
            console.error(`❌ Failed to add to node:`, error);
        }
    }
    return {
        success: addedCount === newNodes.length * parents.length,
        addedCount,
    };
    // Rest of the addElement implementation remains the same...
}
export function addAttribute(doc, xpathExpr, name, value, nsResolver) {
    const nodes = xpath.selectWithResolver(xpathExpr, doc, nsResolver);
    const elements = ensureElementNodes(nodes, xpathExpr);
    if (elements.length === 0) {
        console.error(`❌ No valid elements found for: ${xpathExpr}`);
        return { success: false, addedCount: 0 };
    }
    let addedCount = 0;
    for (const element of elements) {
        try {
            if (element.hasAttribute(name)) {
                console.warn(`⚠️ Attribute ${name} already exists, skipping`);
                continue;
            }
            element.setAttribute(name, value);
            addedCount++;
        }
        catch (error) {
            console.error(`❌ Failed to add attribute to element:`, error);
        }
    }
    return { success: addedCount === elements.length, addedCount };
}
export function addText(doc, xpathExpr, text, nsResolver) {
    // Text can be added to either elements or text nodes
    const nodes = xpath.selectWithResolver(xpathExpr, doc, nsResolver);
    if (nodes.length === 0) {
        console.error(`❌ No nodes found for: ${xpathExpr}`);
        return { success: false, addedCount: 0 };
    }
    // Explicit type checking for each node
    let addedCount = 0;
    for (const node of nodes) {
        if (node.nodeType === 1) {
            // Element
            const element = node;
            if (/\/>$/.test(element.toString())) {
                element.appendChild(doc.createTextNode(""));
            }
            element.appendChild(doc.createTextNode(text));
            addedCount++;
        }
        else if (node.nodeType === 3) {
            // Text
            node.data += text;
            addedCount++;
        }
        else {
            console.warn(`⚠️ Cannot add text to node type ${node.nodeType}`);
        }
    }
    return { success: addedCount === nodes.length, addedCount };
}
/**
 * Removes nodes matching the XPath expression
 * @param doc XML document
 * @param xpathExpr XPath expression to identify nodes to remove
 * @param nsResolver Namespace resolver
 * @returns Removal result with count of removed nodes
 */
function removeNode(doc, xpathExpr, nsResolver) {
    try {
        const nodes = xpath.selectWithResolver(xpathExpr, doc, nsResolver);
        if (nodes.length === 0) {
            const message = `❌ No nodes found matching XPath: ${xpathExpr}`;
            return { success: false, removedCount: 0, error: message };
        }
        if (nodes.length > 1) {
            console.log(`ℹ️ Found ${nodes.length} nodes to remove`);
        }
        let removedCount = 0;
        const skippedNodes = [];
        for (const node of nodes) {
            try {
                if (!node.parentNode) {
                    skippedNodes.push({
                        type: node.nodeType,
                        reason: "No parent node",
                    });
                    continue;
                }
                // Handle different node types appropriately
                switch (node.nodeType) {
                    case 1: // Element
                    case 3: // Text
                    case 4: // CDATASection
                    case 7: // ProcessingInstruction
                    case 8: // Comment
                        node.parentNode.removeChild(node);
                        removedCount++;
                        break;
                    case 2: // Attribute
                        const attr = node;
                        if (attr.ownerElement) {
                            attr.ownerElement.removeAttribute(attr.name);
                            removedCount++;
                        }
                        else {
                            skippedNodes.push({
                                type: node.nodeType,
                                reason: "Orphaned attribute - no owner element",
                            });
                        }
                        break;
                    case 9: // Document
                    case 10: // DocumentType
                    case 11: // DocumentFragment
                        skippedNodes.push({
                            type: node.nodeType,
                            reason: "Cannot remove document-level nodes",
                        });
                        break;
                    default:
                        skippedNodes.push({
                            type: node.nodeType,
                            reason: "Unsupported node type for removal",
                        });
                }
            }
            catch (error) {
                console.error(`⚠️ Failed to remove node type ${node.nodeType}:`, error);
                skippedNodes.push({
                    type: node.nodeType,
                    reason: error instanceof Error ? error.message : "Removal failed",
                });
            }
        }
        // Log warnings about skipped nodes
        if (skippedNodes.length > 0) {
            console.warn(`⚠️ Skipped ${skippedNodes.length} nodes:`);
            const typeNames = {
                1: "Element",
                2: "Attribute",
                3: "Text",
                4: "CDATA",
                7: "ProcessingInstruction",
                8: "Comment",
                9: "Document",
                10: "DocumentType",
                11: "DocumentFragment",
            };
            skippedNodes.forEach(({ type, reason }) => {
                const typeName = typeNames[type] || `Unknown (${type})`;
                console.warn(`  - ${typeName}: ${reason}`);
            });
        }
        return {
            success: removedCount > 0,
            removedCount,
            error: removedCount !== nodes.length
                ? `Only removed ${removedCount} of ${nodes.length} matched nodes`
                : undefined,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`❌ XPath evaluation failed: ${message}`);
        return {
            success: false,
            removedCount: 0,
            error: `XPath evaluation failed: ${message}`,
        };
    }
}
//# sourceMappingURL=cli.js.map