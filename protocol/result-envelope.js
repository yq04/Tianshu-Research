/**
 * Result Envelope for tianshu-research MCP.
 * Ensures computation results, GateReport, RunReceipt, and evidence metadata
 * are retained in the response as structured data while providing compatible
 * markdown/text representations for standard MCP clients.
 */

/**
 * Packages a tool execution result into an MCP response object.
 *
 * @param {any} result Raw output from a tool or gateway action
 * @returns {object} MCP-compliant result envelope
 */
export function packToolResult(result) {
  if (result === null || result === undefined) {
    return {
      content: [{ type: 'text', text: '' }],
      isError: false,
    }
  }

  const isError = Boolean(result.isError)
  const content = []

  let textBody = ''
  if (typeof result === 'string') {
    textBody = result
  } else if (typeof result.content === 'string') {
    textBody = result.content
  } else if (Array.isArray(result.content)) {
    content.push(...result.content)
  } else if (result.data !== undefined) {
    textBody = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: textBody })
  }

  const envelope = {
    content,
    isError,
  }

  if (result.data !== undefined) {
    envelope.data = result.data
    envelope.structuredContent = result.data
  }

  if (result.metadata !== undefined) {
    envelope.metadata = result.metadata
  }

  return envelope
}
