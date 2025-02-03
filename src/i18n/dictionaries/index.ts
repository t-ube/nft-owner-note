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
    taxonHelp: {
      trigger: string;
      title: string;
      step1: {
        title: string;
        description: string;
      };
      step2: {
        title: string;
        description: string;
      };
    };
    errors: {
      loadFailed: string;
      createFailed: string;
      deleteFailed: string;
      duplicateProject: string;
    };
    newProject: {
      placeholders: {
        enterProjectName: string;
        enterIssuerAddress: string;
        enterTaxon: string;
      }
    },
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
        notice: {
          noSalesData: string;
          noSalesDataYet: string;
        },
        actions: {
          updateSaleInfo: string;
          updating: string;
        };
      };
      ownerList: {
        status: {
          showingOwners: string;
          loadingMore: string;
          totalNFTs: string;
        };
        actions: {
          exportRank: string;
          edit: string;
          showGrouped: string;
        };
        table: {
          rank: string;
          owner: string;
          name: string;
          xAccount: string;
          nftCount: string;
          userValue1: string;
          userValue2: string;
          holdingPercentage: string;
          links: string;
        };
        placeholders: {
          noName: string;
          noValue: string;
          noXAccount: string;
        };
      };
      nftListPage: {
        status: {
          showing: string;
          totalNFTs: string;
        };
        actions: {
          updateSaleInfo: string;
          updating: string;
          refresh: string;
        };
        table: {
          serial: string;
          tokenId: string;
          owner: string;
          nftName: string;
          mintedAt: string;
          lastSale: string;
          lastSaleAt: string;
          priceChange: string;
          color: string;
          actions: string;
        };
        colors: {
          noColor: string;
          red: string;
          orange: string;
          yellow: string;
          green: string;
          blue: string;
          purple: string;
          brown: string;
        };
        errors: {
          loadFailed: string;
        };
        placeholders: {
          noDate: string;
          noAmount: string;
          noChange: string;
        };
        format: {
          amount: string;
        };
        pagination: {
          previous: string;
          next: string;
        };
      };
      filters: {
        title: string;
        clearAll: string;
        button: string;
        labels: {
          nftName: string;
          color: string;
          mintDateRange: string;
          lastSaleAmount: string;
          lastSaleDate: string;
        };
        placeholders: {
          searchByName: string;
          selectColor: string;
          min: string;
          max: string;
        };
        colors: {
          red: string;
          orange: string;
          yellow: string;
          green: string;
          blue: string;
          purple: string;
          brown: string;
        };
      };
    };
    owners: {
      title: string;
      search: {
        placeholder: string;
      };
      actions: {
        newOwner: string;
        edit: string;
        delete: string;
      };
      loading: string;
      table: {
        ownerName: string;
        walletAddresses: string;
        xAccount: string;
        memo: string;
        actions: string;
        more: string;
      };
      deleteDialog: {
        title: string;
        description: string;
        cancel: string;
        confirm: string;
      };
      placeholders: {
        noXAccount: string;
        noMemo: string;
        noAddresses: string;
      };
      dialog: {
        title: {
          create: string;
          edit: string;
        };
        labels: {
          ownerName: string;
          xAccount: string;
          memo: string;
          walletAddresses: string;
        };
        placeholders: {
          name: string;
          xAccount: string;
          memo: string;
          address: string;
        };
        actions: {
          add: string;
          save: string;
          remove: string;
        };
      };
      totalOwners: string;
      matchingOwners: string;
      csvImportExport: {
        buttons: {
          exportCSV: string;
          importCSV: string;
          downloadSample: string;
        };
        errors: {
          export: string;
          import: string;
          parse: string;
          read: string;
        };
        validation: {
          nameRequired: string;
          addressRequired: string;
          errorPrefix: string;
        };
        sampleData: {
          name: string;
          xAccount: string;
          memo: string;
        };
      };
    };
    csvImportExport: {
      buttons: {
        exportCSV: string;
        importCSV: string;
      };
      errors: {
        export: string;
        import: string;
        parse: string;
        read: string;
      };
      validation: {
        projectIdRequired: string;
        nameRequired: string;
        issuerRequired: string;
        taxonRequired: string;
        errorPrefix: string;
      };
    };
    sidebar: {
      title: string;
      ownersList: string;
      projectsTitle: string;
      search: {
        placeholder: string;
      };
      noProjects: string;
      footer: {
        developedBy: string;
        followOnX: string;
      };
    };
  };
}


export const getDictionary = async (locale: 'en' | 'ja'): Promise<Dictionary> => {
  return dictionaries[locale]();
};