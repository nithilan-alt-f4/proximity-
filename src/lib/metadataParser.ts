export interface ParsedMetadata {
  title?: string;
  artist?: string;
  album?: string;
  albumCoverUrl?: string;
}

export async function parseAudioMetadata(file: File): Promise<ParsedMetadata> {
  const headerSize = 10;
  if (file.size < headerSize) return {};

  try {
    // Read the first 1MB of the file (ID3 is almost always at the start)
    const sliceSize = Math.min(file.size, 1024 * 1024);
    const buffer = await file.slice(0, sliceSize).arrayBuffer();
    const view = new DataView(buffer);

    // Check signature 'ID3'
    if (
      view.getUint8(0) !== 0x49 || // 'I'
      view.getUint8(1) !== 0x44 || // 'D'
      view.getUint8(2) !== 0x33    // '3'
    ) {
      return {};
    }

    const majorVersion = view.getUint8(3);
    if (majorVersion < 2 || majorVersion > 4) return {};

    // Size is synchsafe integer (4 bytes, 7 bits per byte)
    const b1 = view.getUint8(6);
    const b2 = view.getUint8(7);
    const b3 = view.getUint8(8);
    const b4 = view.getUint8(9);
    const id3Size = ((b1 & 0x7F) << 21) | ((b2 & 0x7F) << 14) | ((b3 & 0x7F) << 7) | (b4 & 0x7F);

    let offset = 10;
    const endOffset = Math.min(id3Size + 10, sliceSize);

    let title: string | undefined;
    let artist: string | undefined;
    let album: string | undefined;
    let albumCoverUrl: string | undefined;

    const decodeString = (data: Uint8Array): string => {
      if (data.length === 0) return "";
      const encoding = data[0];
      const textData = data.subarray(1);
      
      const cleanStr = (str: string) => str.replace(/\0+$/, "").trim();

      try {
        if (encoding === 0x00) {
          // ISO-8859-1
          const decoder = new TextDecoder("iso-8859-1");
          return cleanStr(decoder.decode(textData));
        } else if (encoding === 0x01) {
          // UTF-16 with BOM
          const decoder = new TextDecoder("utf-16");
          return cleanStr(decoder.decode(textData));
        } else if (encoding === 0x02) {
          // UTF-16BE without BOM
          const decoder = new TextDecoder("utf-16be");
          return cleanStr(decoder.decode(textData));
        } else if (encoding === 0x03) {
          // UTF-8
          const decoder = new TextDecoder("utf-8");
          return cleanStr(decoder.decode(textData));
        }
      } catch (e) {
        console.warn("Error decoding metadata string:", e);
      }

      // Fallback: standard ASCII
      let out = "";
      for (let i = 0; i < textData.length; i++) {
        if (textData[i] !== 0) {
          out += String.fromCharCode(textData[i]);
        }
      }
      return out.trim();
    };

    while (offset < endOffset - 10) {
      if (view.getUint8(offset) === 0x00) {
        break;
      }

      let frameId = "";
      let frameSize = 0;

      if (majorVersion === 2) {
        // v2.2 frame header is 6 bytes: ID (3 bytes), Size (3 bytes)
        frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2));
        frameSize = (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | view.getUint8(offset + 5);
        offset += 6;
      } else {
        // v2.3 and v2.4 frame header is 10 bytes: ID (4 bytes), Size (4 bytes), Flags (2 bytes)
        frameId = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );
        
        if (majorVersion === 4) {
          // v2.4 size is synchsafe (4 bytes, 7 bits per byte)
          const s1 = view.getUint8(offset + 4);
          const s2 = view.getUint8(offset + 5);
          const s3 = view.getUint8(offset + 6);
          const s4 = view.getUint8(offset + 7);
          frameSize = ((s1 & 0x7F) << 21) | ((s2 & 0x7F) << 14) | ((s3 & 0x7F) << 7) | (s4 & 0x7F);
        } else {
          // v2.3 size is standard 32-bit int
          frameSize = view.getUint32(offset + 4);
        }
        offset += 10;
      }

      if (frameSize <= 0 || offset + frameSize > endOffset) {
        break;
      }

      const frameData = new Uint8Array(buffer, offset, frameSize);

      const isTitle = (majorVersion === 2 && frameId === "TT2") || (majorVersion > 2 && frameId === "TIT2");
      const isArtist = (majorVersion === 2 && frameId === "TP1") || (majorVersion > 2 && frameId === "TPE1");
      const isAlbum = (majorVersion === 2 && frameId === "TAL") || (majorVersion > 2 && frameId === "TALB");
      const isCover = (majorVersion === 2 && frameId === "PIC") || (majorVersion > 2 && frameId === "APIC");

      if (isTitle) {
        title = decodeString(frameData);
      } else if (isArtist) {
        artist = decodeString(frameData);
      } else if (isAlbum) {
        album = decodeString(frameData);
      } else if (isCover) {
        try {
          if (majorVersion === 2) {
            // PIC structure: [encoding] [format (3 bytes)] [type (1)] [desc (null-terminated)] [data]
            const encoding = frameData[0];
            const format = String.fromCharCode(frameData[1], frameData[2], frameData[3]).toLowerCase();
            const mimeType = format === "png" ? "image/png" : "image/jpeg";
            
            let imgDataOffset = 5;
            while (imgDataOffset < frameData.length && frameData[imgDataOffset] !== 0) {
              imgDataOffset++;
            }
            imgDataOffset++; // skip null term

            if (imgDataOffset < frameData.length) {
              const picBlob = new Blob([frameData.subarray(imgDataOffset)], { type: mimeType });
              albumCoverUrl = URL.createObjectURL(picBlob);
            }
          } else {
            // APIC structure: [encoding] [mime (null-term)] [type (1)] [desc (null-term)] [data]
            const encoding = frameData[0];
            let mimeEnd = 1;
            while (mimeEnd < frameData.length && frameData[mimeEnd] !== 0) {
              mimeEnd++;
            }
            const mimeTypeBytes = frameData.subarray(1, mimeEnd);
            const mimeType = new TextDecoder("ascii").decode(mimeTypeBytes) || "image/jpeg";
            
            let descEnd = mimeEnd + 2;
            if (encoding === 0x01 || encoding === 0x02) {
              while (descEnd < frameData.length - 1 && !(frameData[descEnd] === 0 && frameData[descEnd + 1] === 0)) {
                descEnd++;
              }
              descEnd += 2;
            } else {
              while (descEnd < frameData.length && frameData[descEnd] !== 0) {
                descEnd++;
              }
              descEnd++;
            }

            if (descEnd < frameData.length) {
              const picBlob = new Blob([frameData.subarray(descEnd)], { type: mimeType });
              albumCoverUrl = URL.createObjectURL(picBlob);
            }
          }
        } catch (e) {
          console.warn("Failed to parse cover art frame:", e);
        }
      }

      offset += frameSize;
    }

    return { title, artist, album, albumCoverUrl };
  } catch (err) {
    console.warn("Error reading embedded ID3 metadata:", err);
    return {};
  }
}
