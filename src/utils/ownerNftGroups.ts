// utils/ownerNftGroups.ts
import { NFToken } from '@/utils/db';

/** 1オーナーが保有する、同じ名前の NFT の集まり。 */
export interface OwnerNFTNameGroup {
  /** NFT 名。名前未取得の NFT は null にまとめる。 */
  name: string | null;
  /** グループ化前の NFTokenID（uris と同じ順序） */
  nftIds: string[];
  /** グループ化前の URI（nftIds と同じ順序） */
  uris: string[];
  /** グループ化前のシリアル（nftIds と同じ順序、昇順） */
  serials: number[];
}

/** オーナー単位の保有 NFT。 */
export interface OwnerNFTGroup {
  owner: string;
  nftCount: number;
  /** 名前ごとのグループ（最小シリアル順、名前未取得は末尾） */
  nameGroups: OwnerNFTNameGroup[];
}

/** フィルタのドロップダウンに出す NFT 名の候補。 */
export interface NFTNameOption {
  name: string;
  /** この名前を持つ NFT の URI（重複なし） */
  uris: string[];
  nftCount: number;
  ownerCount: number;
  /** この名前を持つ NFT の最小シリアル（並び順に使う） */
  minSerial: number;
}

const normalizeName = (name?: string | null): string | null => {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
};

/** バーンされていない NFT をオーナー → 名前の順にグループ化する。 */
export function groupNFTsByOwner(nfts: NFToken[]): OwnerNFTGroup[] {
  const owners = new Map<string, Map<string | null, OwnerNFTNameGroup>>();

  const sorted = [...nfts].sort((a, b) => a.nft_serial - b.nft_serial);
  for (const nft of sorted) {
    if (nft.is_burned) continue;

    let byName = owners.get(nft.owner);
    if (!byName) {
      byName = new Map();
      owners.set(nft.owner, byName);
    }

    const name = normalizeName(nft.name);
    let group = byName.get(name);
    if (!group) {
      group = { name, nftIds: [], uris: [], serials: [] };
      byName.set(name, group);
    }
    group.nftIds.push(nft.nft_id);
    group.uris.push(nft.uri);
    group.serials.push(nft.nft_serial);
  }

  return Array.from(owners, ([owner, byName]) => {
    const nameGroups = Array.from(byName.values()).sort((a, b) => {
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      return a.serials[0] - b.serials[0];
    });
    const nftCount = nameGroups.reduce((sum, g) => sum + g.nftIds.length, 0);
    return { owner, nftCount, nameGroups };
  }).sort((a, b) => b.nftCount - a.nftCount);
}

/** グループ化済みデータから、名前ごとの候補（URI・保有数・保有者数）を作る。 */
export function buildNameOptions(groups: OwnerNFTGroup[]): NFTNameOption[] {
  const options = new Map<string, { uris: Set<string>; nftCount: number; ownerCount: number; minSerial: number }>();

  for (const group of groups) {
    for (const nameGroup of group.nameGroups) {
      if (nameGroup.name === null) continue;
      const option = options.get(nameGroup.name)
        ?? { uris: new Set<string>(), nftCount: 0, ownerCount: 0, minSerial: Infinity };
      options.set(nameGroup.name, option);
      nameGroup.uris.forEach(uri => option.uris.add(uri));
      option.nftCount += nameGroup.nftIds.length;
      option.ownerCount += 1;
      option.minSerial = Math.min(option.minSerial, nameGroup.serials[0]);
    }
  }

  return Array.from(options, ([name, o]) => ({
    name,
    uris: Array.from(o.uris),
    nftCount: o.nftCount,
    ownerCount: o.ownerCount,
    minSerial: o.minSerial,
  })).sort((a, b) => a.minSerial - b.minSerial);
}

/** 指定した名前をすべて保有しているオーナーだけを返す（名前が空なら全件）。 */
export function filterOwnersByNames(groups: OwnerNFTGroup[], names: string[]): OwnerNFTGroup[] {
  if (names.length === 0) return groups;
  return groups.filter(group => {
    const held = new Set(group.nameGroups.map(g => g.name));
    return names.every(name => held.has(name));
  });
}
