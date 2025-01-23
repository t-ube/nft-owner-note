// src/i18n/dictionaries/index.ts
const dictionaries = {
  en: async () => (await import('./en.json')).default,
  ja: async () => (await import('./ja.json')).default
};


export interface Dictionary {
  project: {
    title: string;
    name: string;
    issuerAddress: string;
    taxon: string;
    createButton: string;
    creating: string;
    deleteConfirm: string;
    deleteDescription: string;
    cancel: string;
    delete: string;
    errors: {
      loadFailed: string;
      createFailed: string;
      deleteFailed: string;
      duplicateProject: string;
    };
    success: {
      created: string;
      deleted: string;
    };
    detail: {
      loading: string;
      notFound: string;
      ownerRank: string;
      nftList: string;
      statistics: string;
      tabs: {
        owners: string;
        nfts: string;
        stats: string;
      };
      info: {
        title: string;
        name: string;
        issuerAddress: string;
        taxon: string;
        projectId: string;
        created: string;
        updated: string;
        edit: string;
        save: string;
        cancel: string;
        enterName: string;
        updateError: string;
      };
      stats: {
        error: string;
        sevenDayMints: {
          title: string;
          totalMints: string;
        };
        sevenDayFirstSales: {
          title: string;
          totalFirstSales: string;
        };
        sevenDayUniqueBuyers: {
          title: string;
          description: string;
        };
        avgTimeToFirstSale: {
          title: string;
          description: string;
        };
        colorClassification: {
          title: string;
          classified: string;
          unclassified: string;
          nfts: string;
          lastUpdated: string;
        };
        colorDistribution: {
          title: string;
          colors: {
            red: string;
            orange: string;
            yellow: string;
            green: string;
            blue: string;
            purple: string;
            brown: string;
            unclassified: string;
          };
        };
        paretoAnalysis: {
          title: string;
          status: {
            wellDistributed: {
              label: string;
              description: string;
            };
            typical: {
              label: string;
              description: string;
            };
            concentrated: {
              label: string;
              description: string;
            };
          };
          holdersInfo: string;
        };
      };
    };
  };
}


export const getDictionary = async (locale: 'en' | 'ja'): Promise<Dictionary> => {
  return dictionaries[locale]();
};