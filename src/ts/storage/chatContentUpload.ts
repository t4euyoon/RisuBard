import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_CHAT_UPLOAD_CHUNK_MIB, normalizeChatUploadChunkMiB } from './chatUploadSettings'

export const CHAT_UPLOAD_CHUNK_BYTES = DEFAULT_CHAT_UPLOAD_CHUNK_MIB * 1024 * 1024

/** Keep each HTTP request bounded; only the last chunk commits the chat. */
export async function uploadChatContent(
    request: (url: string, init: RequestInit) => Promise<Response>,
    chaId: string, chatIndex: number, chatId: string, encoded: Uint8Array,
    chunkMiB: unknown = DEFAULT_CHAT_UPLOAD_CHUNK_MIB,
    enabled = false,
): Promise<Response> {
    const suffix = `${encodeURIComponent(chaId)}/${chatIndex}`
    return uploadBinaryContent(request, `/api/chat-content/${suffix}`,
        `/api/chat-content-upload/${suffix}`,
        { 'content-type': 'application/octet-stream', 'x-chat-id': chatId },
        encoded, chunkMiB, enabled)
}

/** Shared bounded transport for chat content and memory save snapshots. */
export async function uploadBinaryContent(
    request: (url: string, init: RequestInit) => Promise<Response>,
    directUrl: string, uploadUrl: string, headers: Record<string, string>,
    encoded: Uint8Array, chunkMiB: unknown = DEFAULT_CHAT_UPLOAD_CHUNK_MIB,
    enabled = false,
): Promise<Response> {
    const chunkBytes = normalizeChatUploadChunkMiB(chunkMiB) * 1024 * 1024
    if (!enabled || encoded.byteLength <= chunkBytes) {
        return request(directUrl, {
            method: 'POST', headers, body: encoded as BodyInit,
        })
    }

    const uploadId = uuidv4()
    const url = uploadUrl
    let committed = false
    try {
        for (let offset = 0, index = 0; offset < encoded.byteLength; offset += chunkBytes, index++) {
            const end = Math.min(offset + chunkBytes, encoded.byteLength)
            const response = await request(url, {
                method: 'POST',
                headers: {
                    ...headers,
                    'x-upload-id': uploadId,
                    'x-upload-index': String(index),
                    'x-upload-size': String(encoded.byteLength),
                    'x-upload-chunk-size': String(chunkBytes),
                },
                body: encoded.subarray(offset, end) as BodyInit,
            })
            if (!response.ok) return response
            if (end === encoded.byteLength) {
                committed = true
                return response
            }
            const ack = await response.json()
            if (ack.uploadId !== uploadId || ack.nextIndex !== index + 1) {
                throw new Error('Invalid chat upload acknowledgement')
            }
        }
        throw new Error('Incomplete chat upload')
    } finally {
        if (!committed) {
            // Do not mask the save/conflict error if the network is unavailable.
            await request(url, { method: 'DELETE', headers: { ...headers, 'x-upload-id': uploadId } }).catch(() => {})
        }
    }
}
