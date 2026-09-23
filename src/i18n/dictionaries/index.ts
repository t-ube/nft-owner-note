// src/i18n/dictionaries/index.ts
const dictionaries = {
  en: async () => (await import('./en.json')).default,
  ja: async () => (await import('./ja.json')).default
};


export interface Dictionary {
  menu: {
    connect: string;
    disconnect: string;
    login: string;
    logout: string;
    settings: string;
  };
  walletSelect: {
    title: string;
    description: string;
  };
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
      fetchFailed: string;
      saveFailed: string;
      updateFailed: string;
      importFailed: string;
      nftFetchFailed: string;
      noActiveNFT: string;
      metadataFetchFailed: string;
      ownerExportFailed: string;
      ownerImportFailed: string;
      csvParseFailed: string;
      fileReadFailed: string;
      csvValidationError: string;
      projectExportFailed: string;
      projectImportFailed: string;
    };
    validation: {
      projectIdRequired: string;
      nameRequired: string;
      issuerRequired: string;
      taxonRequired: string;
      errorPrefix: string;
    };
    newProject: {
      placeholders: {
        enterProjectName: string;
        enterIssuerAddress: string;
        enterTaxon: string;
      }
    },
    bulkCreate: {
      button: string;
      title: string;
      description: string;
      placeholder: string;
      fetch: string;
      create: string;
      fetchError: string;
      createError: string;
      success: string;
      noNewProjects: string;
      table: {
        name: string;
        taxon: string;
      }
    }
    success: {
      created: string;
      deleted: string;
    };
    detail: {
      loading: string;
      notFound: string;
      stats: {
        nfts: string;
        owners: string;
      };
      ownerRank: string;
      nftList: string;
      tabs: {
        owners: string;
        nfts: string;
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
        issuerName: string;
        xAccount: string;
        links: string;
        details: string;
        copy: string;
      };
      ownerList: {
        search: {
          placeholder: string;
        };
        named: {
          label: string;
          count: string;
          complete: string;
          help: string;
        };
        status: {
          showingOwners: string;
          loadingMore: string;
          totalNFTs: string;
        };
        actions: {
          getProfileFromXrpCafe: string;
          exportRank: string;
          edit: string;
          byOwner: string;
          byGroup: string;
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
      ownerCollection: {
        title: string;
        description: string;
        unnamed: string;
        showMore: string;
        showLess: string;
        filter: {
          label: string;
          placeholder: string;
          selectedCount: string;
          searchPlaceholder: string;
          noResults: string;
          holders: string;
          clear: string;
        };
        status: {
          owners: string;
          matched: string;
          unnamed: string;
          noData: string;
        };
        actions: {
          fetchNames: string;
          fetchingNames: string;
        };
        used: {
          modeLabel: string;
          mark: string;
          unmark: string;
          badgeUsed: string;
          badgePartial: string;
          hideUsed: string;
          usedAtLabel: string;
          usedByLabel: string;
          transferredNote: string;
          badgeTransferred: string;
        };
        table: {
          owner: string;
          nftCount: string;
          kinds: string;
          kindsUnnamed: string;
          nfts: string;
        };
        errors: {
          loadFailed: string;
        };
      };
      ownerActivity: {
        title: string;
        description: string;
        status: {
          loading: string;
          showing: string;
          noData: string;
        };
        actions: {
          holdersOnly: string;
          export: string;
        };
        table: {
          owner: string;
          name: string;
          holding: string;
          purchaseCount: string;
          purchaseXrp: string;
          distributionCount: string;
          launchpadCount: string;
          activeDays: string;
          activeMonths: string;
          firstAt: string;
          lastAt: string;
          links: string;
        };
        legend: {
          toggle: string;
          holding: string;
          purchaseXrp: string;
          purchaseCount: string;
          distributionCount: string;
          launchpadCount: string;
          activeDays: string;
          activeMonths: string;
          lastAt: string;
          firstAt: string;
        };
        errors: {
          loadFailed: string;
        };
      };
      ownerPlant: {
        title: string;
        description: string;
        status: {
          loading: string;
          showing: string;
          noData: string;
        };
        actions: {
          limit: string;
          openCollection: string;
          retry: string;
          closeFocus: string;
          all: string;
          zoomIn: string;
          zoomOut: string;
          zoomReset: string;
        };
        hub: {
          fallback: string;
        };
        legend: {
          toggle: string;
          branchLabel: string;
          branch: string;
          nodeLabel: string;
          node: string;
          lineLabel: string;
          line: string;
          sizeLabel: string;
          size: string;
          colorLabel: string;
          color: string;
          days: string;
          sproutLabel: string;
          sprout: string;
          leavesLabel: string;
          leaves: string;
          note: string;
        };
        list: {
          sproutOnly: string;
          showing: string;
          owner: string;
          spend: string;
          leaves: string;
          lastAt: string;
          firstAt: string;
          collections: string;
          links: string;
          legend: {
            toggle: string;
            owner: string;
            spend: string;
            leaves: string;
            lastAt: string;
            firstAt: string;
            collections: string;
          };
        };
        tooltip: {
          lastActive: string;
          acquired: string;
          spend: string;
          collections: string;
          wallets: string;
        };
        errors: {
          loadFailed: string;
        };
      };
      community: {
        title: string;
        description: string;
        status: {
          loading: string;
          showing: string;
          noData: string;
        };
        actions: {
          fansOnly: string;
          creatorsOnly: string;
          retry: string;
          openCreator: string;
          showHome: string;
          closeFocus: string;
          zoomIn: string;
          zoomOut: string;
          zoomReset: string;
        };
        hub: {
          others: string;
          members: string;
        };
        bands: {
          core: string;
          light: string;
          guest: string;
          gift: string;
        };
        legend: {
          toggle: string;
          centerLabel: string;
          center: string;
          hubLabel: string;
          hub: string;
          othersLabel: string;
          others: string;
          flowLabel: string;
          flow: string;
          sizeLabel: string;
          size: string;
          colorLabel: string;
          color: string;
          creatorLabel: string;
          creator: string;
          note: string;
        };
        tooltip: {
          home: string;
          spend: string;
          loyalty: string;
          creator: string;
          members: string;
          flow: string;
        };
        errors: {
          loadFailed: string;
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
          links: string;
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
          removeThisOwner: string;
          addWalletAddress: string;
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
    myAccount: {
      title: string;
      wallet: string;
      address: string;
      balance: string;
      walletType: string;
      copyAddress: string;
      addressCopied: string;
      disconnect: string;
      logout: string;
      xrp: string;
      revenue: string;
      last30Days: string;
      commingSoon: string;
      settings: string;
      cloudBackup: string;
      backupFeature: string;
      revenueTracking: string;
      prepareRevenue: string;
      cloudSync: {
        title: string;
        description: string;
        signedInAs: string;
        expiresAt: string;
        signIn: string;
        signOut: string;
        notSignedIn: string;
        dialogTitle: string;
        dialogDescription: string;
        openInXaman: string;
        cancel: string;
        signError: string;
      };
    };
    sidebar: {
      title: string;
      myAccount: string;
      ownersList: string;
      integration: string;
      projectsTitle: string;
      search: {
        placeholder: string;
      };
      add: {
        label: string;
        manual: string;
        dialogTitle: string;
        dialogDescription: string;
        issuer: string;
        taxon: string;
        submit: string;
        invalid: string;
        failed: string;
      };
      sections: {
        pinned: string;
        recent: string;
        all: string;
        pinHint: string;
      };
      pin: string;
      unpin: string;
      noProjects: string;
      edit: string;
      save: string;
      cancel: string;
      delete: string;
      saveError: string;
      emptyNameError: string;
      manual: string;
      footer: {
        developedBy: string;
        followOnX: string;
        help: string;
        settings: string;
      };
      bottomNav: {
        projects: string;
        owners: string;
        crossProject: string;
        myAccount: string;
        more: string;
      };
    };
    integration: {
      title: string;
      placeholders: {
        searchProjects: string;
        selectProject: string;
        selectProjectToAnalyze: string;
      };
      status: {
        loading: string;
        showingOwners: string;
        updatingProject: string;
        updateComplete: string;
      };
      actions: {
        updateNFTs: string;
        exportRank: string;
        showGrouped: string;
      };
      table: {
        rank: string;
        owner: string;
        name: string;
        xAccount: string;
        totalNfts: string;
        share: string;
        title: string;
      };
      tabs: {
        owners: string;
        allowlist: string;
      };
    };
    allowlist: {
      status: {
        total: string;
        updatingProject: string;
        updateComplete: string;
      },
      actions: {
        updateNFTs: string;
      },
      address: string;
      name: string;
      totalNFTs: string;
      mints: string;
      export: string;
      clear: string;
      save: string;
      cancel: string;
      applyRules: string;
      loadingRules: string;
      ruleSettings: string;
      minNFTs: string;
      mintCount: string;
      addRule: string;
      removeRule: string;
      manualEntry: string;
    };
  };
}


export const getDictionary = async (locale: 'en' | 'ja'): Promise<Dictionary> => {
  return dictionaries[locale]();
};