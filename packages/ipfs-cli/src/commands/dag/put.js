import * as dagCBOR from '@ipld/dag-cbor'
import * as dagPB from '@ipld/dag-pb'
import * as dagJSON from '@ipld/dag-json'
import * as raw from 'multiformats/codecs/raw'
import concat from 'it-concat'
import parseDuration from 'parse-duration'

/**
 * @template T
 * @typedef {import('multiformats/codecs/interface').BlockCodec<number, T>} BlockCodec
 */

/**
 * @type {Record<string, BlockCodec<any>>}
 */
const codecs = [dagCBOR, dagJSON, dagPB, raw].reduce((/** @type {Record<string, BlockCodec<any>>} */ m, codec) => {
  m[codec.name] = codec
  return m
}, /** @type {Record<string, BlockCodec<any>>} */ {})

export default {
  command: 'put [data]',

  describe: 'accepts input from a file or stdin and parses it into an object of the specified format',

  builder: {
    data: {
      type: 'string'
    },
    'store-codec': {
      type: 'string',
      default: 'dag-cbor',
      describe: 'The codec that the stored object will be encoded with',
      choices: ['dag-cbor', 'dag-json', 'dag-pb', 'raw']
    },
    'input-codec': {
      type: 'string',
      default: 'dag-json',
      describe: 'The codec that the input object is encoded with',
      choices: ['dag-cbor', 'dag-json', 'dag-pb', 'raw']
    },
    pin: {
      type: 'boolean',
      default: true,
      describe: 'Pin this object when adding'
    },
    'hash-alg': {
      type: 'string',
      alias: 'hash',
      default: 'sha2-256',
      describe: 'Hash function to use'
    },
    'cid-version': {
      type: 'integer',
      describe: 'CID version. Defaults to 0 unless an option that depends on CIDv1 is passed',
      default: 0
    },
    'cid-base': {
      describe: 'Number base to display CIDs in.',
      type: 'string',
      default: 'base58btc'
    },
    preload: {
      type: 'boolean',
      default: true,
      describe: 'Preload this object when adding'
    },
    'only-hash': {
      type: 'boolean',
      default: false,
      describe: 'Only hash the content, do not write to the underlying block store'
    },
    timeout: {
      type: 'string',
      coerce: parseDuration
    }
  },

  /**
   * @param {object} argv
   * @param {import('../../types').Context} argv.ctx
   * @param {string} argv.data
   * @param {'dag-cbor' | 'dag-json' | 'dag-pb' | 'raw'} argv.inputCodec
   * @param {'dag-cbor' | 'dag-json' | 'dag-pb' | 'raw'} argv.storeCodec
   * @param {import('multiformats/cid').CIDVersion} argv.cidVersion
   * @param {boolean} argv.pin
   * @param {string} argv.hashAlg
   * @param {string} argv.cidBase
   * @param {boolean} argv.preload
   * @param {boolean} argv.onlyHash
   * @param {number} argv.timeout
   */
  async handler ({ ctx: { ipfs, print, getStdin }, data, inputCodec, storeCodec, pin, hashAlg, cidVersion, cidBase, preload, onlyHash, timeout }) {
    if (!codecs[inputCodec]) {
      throw new Error(`Unknown input-codec ${inputCodec}`)
    }

    if (storeCodec !== 'dag-pb') {
      cidVersion = 1
    }

    /** @type {Buffer} */
    let source

    if (!data) {
      // pipe from stdin
      source = (await concat(getStdin(), { type: 'buffer' })).slice()
    } else {
      source = Buffer.from(data)
    }

    const node = codecs[inputCodec].decode(source)

    const cid = await ipfs.dag.put(node, {
      storeCodec,
      hashAlg,
      version: cidVersion,
      onlyHash,
      preload,
      pin,
      timeout
    })
    const base = await ipfs.bases.getBase(cidBase)

    print(cid.toString(base.encoder))
  }
}
