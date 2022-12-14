import _ from "lodash";
import axios from "axios";
import { ethers } from "ethers";
import { EvmRpcProvider } from "@selendra/eth-providers";
import artifact from "../../public/Identity.json";

const network = process.env.NEXT_PUBLIC_WSS_ADDRESS || "";
const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDR || "";
const ipfs = process.env.NEXT_PUBLIC_IPFS_ADDRESS || "";

const ipfs_address = (cid) => `${ipfs}/files/${cid}`;

export default async function handler(req, res) {
  try {
    const provider = EvmRpcProvider.from(network);
    await provider.isReady();
    const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

    const _lastID = await contract.lastID();
    const lastID = ethers.BigNumber.from(_lastID).toNumber();
    const dids = [];

    for (let i = 0; i < lastID; i++) {
      dids.push(i);
    }

    const details = await Promise.all(
      dids.map(async (did) => {
        const cid = await contract.getContentOf(did);
        const owner = await contract.getOwnerOf(cid);
        const details = await axios
          .get(ipfs_address(cid))
          .then((res) => res.data)
          .catch((error) => null);
        const meta = await contract.getMetaOf(did);
        const state = meta["state"];
        const ctype = meta["ctype"];
        const parent = meta["parent"].toNumber();

        if (details === null) {
          return null;
        }
        if (ctype === 2) {
          const isVerified = await contract.verify(did);
          return { did, cid, owner, ctype, state, parent, isVerified, details };
        }
        return { did, cid, owner, ctype, state, parent, details };
      })
    ).then((data) => data);
    const safe = details.filter((d) => d !== null);
    const data = _.groupBy(safe, (detail) => {
      switch (detail.ctype) {
        case 0:
          return "organizations";
        case 1:
          return "schemas";
        default:
          return "credentials";
      }
    });

    res.status(200).json(data);
  } catch (error) {
    res.json(error);
  }
}
