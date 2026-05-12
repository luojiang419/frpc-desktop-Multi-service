<script lang="ts" setup>
import IconifyIconOffline from "@/components/IconifyIcon/src/iconifyIconOffline";
import Breadcrumb from "@/layout/compoenets/Breadcrumb.vue";
import { useFrpcDesktopStore } from "@/store/frpcDesktop";
import { on, removeRouterListeners, send } from "@/utils/ipcUtils";
import { useDebounceFn } from "@vueuse/core";
import { ElMessage, ElMessageBox, FormInstance, FormRules } from "element-plus";
import { Base64 } from "js-base64";
import {
  defineComponent,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch
} from "vue";
import { useI18n } from "vue-i18n";
import { ipcRouters } from "../../../electron/core/IpcRouter";

defineComponent({
  name: "Config"
});

const { t } = useI18n();
const frpcDesktopStore = useFrpcDesktopStore();

const createDefaultGlobalSettings = (): FrpcGlobalSettings => ({
  _id: "global-settings",
  frpcVersion: null,
  system: {
    launchAtStartup: false,
    silentStartup: false,
    autoConnectOnStartup: false,
    language: "en-US"
  }
});

const createDefaultProfile = (): FrpsServerProfile => ({
  _id: "",
  name: "",
  multiuser: false,
  loginFailExit: false,
  udpPacketSize: 1500,
  serverAddr: "",
  serverPort: 7000,
  auth: {
    method: "none",
    token: ""
  },
  log: {
    to: "",
    level: "info",
    maxDays: 3,
    disablePrintColor: false
  },
  transport: {
    dialServerTimeout: 10,
    dialServerKeepalive: 7200,
    poolCount: 0,
    tcpMux: true,
    tcpMuxKeepaliveInterval: 30,
    protocol: "tcp",
    connectServerLocalIP: "",
    proxyURL: "",
    tls: {
      enable: true,
      certFile: "",
      keyFile: "",
      trustedCaFile: "",
      serverName: "",
      disableCustomTLSFirstByte: true
    },
    heartbeatInterval: 30,
    heartbeatTimeout: 90
  },
  metadatas: {
    token: ""
  },
  user: ""
});

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const globalSettings = ref<FrpcGlobalSettings>(createDefaultGlobalSettings());
const serverProfiles = ref<FrpsServerProfile[]>([]);
const loading = ref(1);
const copyServerConfigBase64 = ref("");
const pasteServerConfigBase64 = ref("");
const protocol = ref("frp://");
const currentSelectFileType = ref<"cert" | "key" | "ca" | "">( "");
const globalFormRef = ref<FormInstance>();
const profileFormRef = ref<FormInstance>();
const profileDialog = reactive({
  visible: false,
  title: ""
});
const profileForm = ref<FrpsServerProfile>(createDefaultProfile());
const visible = reactive({
  copyServerConfig: false,
  pasteServerConfig: false
});

const globalRules = reactive<FormRules>({
  frpcVersion: [
    {
      required: true,
      message: t("config.form.frpcVerson.requireMessage"),
      trigger: "change"
    }
  ]
});

const profileRules = reactive<FormRules>({
  name: [
    {
      required: true,
      message: t("config.form.profileName.requireMessage"),
      trigger: "blur"
    }
  ],
  serverAddr: [
    {
      required: true,
      message: t("config.form.serverAddr.requireMessage"),
      trigger: "blur"
    }
  ],
  serverPort: [
    {
      required: true,
      message: t("config.form.serverPort.requireMessage"),
      trigger: "change"
    }
  ],
  "auth.token": [
    {
      validator: (_rule, value, callback) => {
        if (
          profileForm.value.auth.method === "token" &&
          (!value || !String(value).trim())
        ) {
          callback(new Error(t("config.form.authToken.requireMessage")));
          return;
        }
        callback();
      },
      trigger: "blur"
    }
  ],
  "metadatas.token": [
    {
      validator: (_rule, value, callback) => {
        if (profileForm.value.multiuser && (!value || !String(value).trim())) {
          callback(new Error(t("config.form.metadatasToken.requireMessage")));
          return;
        }
        callback();
      },
      trigger: "blur"
    }
  ],
  "transport.proxyURL": [
    {
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        const valid = /^https?:\/\/([^\s:@]+:[^\s:@]+@)?[^\s:@]+(:\d+)?$/.test(
          String(value)
        );
        if (!valid) {
          callback(new Error(t("config.form.transportProxyURL.patternMessage")));
          return;
        }
        callback();
      },
      trigger: "blur"
    }
  ]
});

const checkAndResetVersion = () => {
  const currentVersion = globalSettings.value.frpcVersion;
  if (
    currentVersion &&
    !frpcDesktopStore.downloadedVersions.some(
      item => item.githubReleaseId === currentVersion
    )
  ) {
    globalSettings.value.frpcVersion = null;
  }
};

watch(
  () => frpcDesktopStore.downloadedVersions,
  () => {
    checkAndResetVersion();
  }
);

const loadPageData = () => {
  send(ipcRouters.SERVER.getGlobalSettings);
  send(ipcRouters.SERVER.getServerProfiles);
};

const handleSaveGlobalSettings = useDebounceFn(() => {
  if (!globalFormRef.value) {
    return;
  }
  globalFormRef.value.validate(valid => {
    if (!valid) {
      return;
    }
    const payload = clone(globalSettings.value);
    loading.value++;
    try {
      send(ipcRouters.SERVER.saveGlobalSettings, payload);
    } catch (error) {
      loading.value--;
      ElMessage({
        type: "error",
        message: String(error)
      });
    }
  });
}, 300);

const handleOpenCreateProfile = () => {
  profileForm.value = createDefaultProfile();
  profileDialog.title = t("config.dialog.profile.createTitle");
  profileDialog.visible = true;
};

const handleOpenEditProfile = (profile: FrpsServerProfile) => {
  profileForm.value = clone(profile);
  profileDialog.title = t("config.dialog.profile.editTitle");
  profileDialog.visible = true;
};

const handleSaveProfile = useDebounceFn(() => {
  if (!profileFormRef.value) {
    return;
  }
  profileFormRef.value.validate(valid => {
    if (!valid) {
      return;
    }
    const payload = clone(profileForm.value);
    loading.value++;
    try {
      send(ipcRouters.SERVER.saveServerProfile, payload);
    } catch (error) {
      loading.value--;
      ElMessage({
        type: "error",
        message: String(error)
      });
    }
  });
}, 300);

const closeProfileDialog = () => {
  profileDialog.visible = false;
  profileFormRef.value?.clearValidate();
};

const handleDeleteProfile = (profile: FrpsServerProfile) => {
  ElMessageBox.confirm(
    t("config.dialog.profile.deleteMessage", { name: profile.name }),
    t("config.dialog.profile.deleteTitle"),
    {
      confirmButtonText: t("common.delete"),
      cancelButtonText: t("common.close"),
      type: "warning"
    }
  ).then(() => {
    loading.value++;
    send(ipcRouters.SERVER.deleteServerProfile, profile._id);
  });
};

const buildSharePayload = (profile: FrpsServerProfile) => {
  const shareConfig = clone(profile);
  delete shareConfig._id;
  shareConfig.transport.tls.certFile = "";
  shareConfig.transport.tls.keyFile = "";
  shareConfig.transport.tls.trustedCaFile = "";
  shareConfig.log.to = "";
  return shareConfig;
};

const handleCopyServerConfig2Base64 = useDebounceFn((profile: FrpsServerProfile) => {
  const base64str = Base64.encode(JSON.stringify(buildSharePayload(profile)));
  copyServerConfigBase64.value = protocol.value + base64str;
  visible.copyServerConfig = true;
}, 300);

const handlePasteServerConfig4Base64 = useDebounceFn(() => {
  visible.pasteServerConfig = true;
}, 300);

const handlePasteServerConfigBase64 = useDebounceFn(() => {
  const tips = () => {
    ElMessage({
      type: "warning",
      message: t("config.message.invalidLink")
    });
  };

  if (!pasteServerConfigBase64.value.startsWith(protocol.value)) {
    tips();
    return;
  }

  const ciphertext = pasteServerConfigBase64.value.replace(protocol.value, "");
  const plaintext = Base64.decode(ciphertext);
  let serverConfig = null;

  try {
    serverConfig = JSON.parse(plaintext);
  } catch {
    tips();
    return;
  }

  if (!serverConfig?.serverAddr || !serverConfig?.serverPort) {
    tips();
    return;
  }

  const importedProfile = {
    ...createDefaultProfile(),
    ...serverConfig,
    name:
      serverConfig.name ||
      `${serverConfig.serverAddr}:${serverConfig.serverPort}`
  } as FrpsServerProfile;

  loading.value++;
  send(ipcRouters.SERVER.saveServerProfile, importedProfile);
  pasteServerConfigBase64.value = "";
  visible.pasteServerConfig = false;
}, 300);

const handleImportConfig = () => {
  loading.value++;
  send(ipcRouters.SERVER.importTomlConfig);
};

const handleExportConfig = useDebounceFn(() => {
  send(ipcRouters.SERVER.exportConfig);
}, 300);

const handleResetConfig = () => {
  ElMessageBox.alert(
    t("config.alert.resetConfig.message"),
    t("config.alert.resetConfig.title"),
    {
      showCancelButton: true,
      cancelButtonText: t("config.alert.resetConfig.cancel"),
      confirmButtonText: t("config.alert.resetConfig.confirm")
    }
  ).then(() => {
    send(ipcRouters.SERVER.resetAllConfig);
  });
};

const handleOpenDataFolder = useDebounceFn(() => {
  send(ipcRouters.SYSTEM.openAppData);
}, 300);

const handleSystemLanguageChange = (language: string) => {
  globalSettings.value.system.language = language;
  send(ipcRouters.SERVER.saveLanguage, language);
};

const handleSelectFile = (type: "cert" | "key" | "ca", ext: string[]) => {
  currentSelectFileType.value = type;
  send(ipcRouters.SYSTEM.selectLocalFile, {
    name: "",
    extensions: ext
  });
};

onMounted(() => {
  loadPageData();

  on(
    ipcRouters.SERVER.getGlobalSettings,
    data => {
      globalSettings.value = {
        ...createDefaultGlobalSettings(),
        ...data,
        system: {
          ...createDefaultGlobalSettings().system,
          ...(data?.system || {})
        }
      };
      checkAndResetVersion();
      loading.value--;
    },
    () => {
      loading.value = Math.max(0, loading.value - 1);
    }
  );

  on(ipcRouters.SERVER.getServerProfiles, data => {
    serverProfiles.value = data || [];
  });

  on(
    ipcRouters.SERVER.saveGlobalSettings,
    () => {
      ElMessage({
        type: "success",
        message: t("config.message.saveSuccess")
      });
      loading.value--;
      frpcDesktopStore.getLanguage();
    },
    () => {
      loading.value = Math.max(0, loading.value - 1);
    }
  );

  on(
    ipcRouters.SERVER.saveServerProfile,
    () => {
      ElMessage({
        type: "success",
        message: profileForm.value._id
          ? t("common.modifySuccess")
          : t("common.createSuccess")
      });
      loading.value--;
      closeProfileDialog();
      send(ipcRouters.SERVER.getServerProfiles);
    },
    () => {
      loading.value = Math.max(0, loading.value - 1);
    }
  );

  on(
    ipcRouters.SERVER.deleteServerProfile,
    () => {
      ElMessage({
        type: "success",
        message: t("common.deleteSuccess")
      });
      loading.value--;
      send(ipcRouters.SERVER.getServerProfiles);
    },
    () => {
      loading.value = Math.max(0, loading.value - 1);
    }
  );

  on(ipcRouters.SYSTEM.selectLocalFile, data => {
    if (!data.canceled) {
      if (currentSelectFileType.value === "cert") {
        profileForm.value.transport.tls.certFile = data.path as string;
      } else if (currentSelectFileType.value === "key") {
        profileForm.value.transport.tls.keyFile = data.path as string;
      } else if (currentSelectFileType.value === "ca") {
        profileForm.value.transport.tls.trustedCaFile = data.path as string;
      }
    }
  });

  on(ipcRouters.SERVER.resetAllConfig, () => {
    ElMessageBox.alert(
      t("config.alert.resetConfigSuccess.message"),
      t("config.alert.resetConfigSuccess.title"),
      {
        closeOnClickModal: false,
        showClose: false,
        confirmButtonText: t("config.alert.resetConfigSuccess.confirm")
      }
    ).then(() => {
      send(ipcRouters.SYSTEM.relaunchApp);
    });
  });

  on(
    ipcRouters.SERVER.importTomlConfig,
    data => {
      loading.value--;
      if (!data?.canceled) {
        ElMessage({
          type: "success",
          message: t("config.message.importProfileSuccess", {
            name: data?.profile?.name || ""
          })
        });
        send(ipcRouters.SERVER.getServerProfiles);
      }
    },
    () => {
      loading.value = Math.max(0, loading.value - 1);
    }
  );

  on(ipcRouters.SERVER.exportConfig, data => {
    if (!data.canceled) {
      ElMessageBox.alert(
        t("config.message.exportProfilesSuccess", {
          count: data.paths.length
        }),
        t("config.dialog.export.title")
      );
    }
  });

  on(ipcRouters.SYSTEM.openAppData, () => {
    ElMessage({
      type: "success",
      message: t("config.message.openAppDataSuccess")
    });
  });

  on(ipcRouters.SERVER.saveLanguage, () => {
    ElMessage({
      type: "success",
      message: t("config.message.saveSuccess")
    });
    frpcDesktopStore.getLanguage();
  });
});

onUnmounted(() => {
  removeRouterListeners(ipcRouters.SERVER.getGlobalSettings);
  removeRouterListeners(ipcRouters.SERVER.getServerProfiles);
  removeRouterListeners(ipcRouters.SERVER.saveGlobalSettings);
  removeRouterListeners(ipcRouters.SERVER.saveServerProfile);
  removeRouterListeners(ipcRouters.SERVER.deleteServerProfile);
  removeRouterListeners(ipcRouters.SERVER.resetAllConfig);
  removeRouterListeners(ipcRouters.SERVER.importTomlConfig);
  removeRouterListeners(ipcRouters.SERVER.exportConfig);
  removeRouterListeners(ipcRouters.SERVER.saveLanguage);
  removeRouterListeners(ipcRouters.SYSTEM.openAppData);
  removeRouterListeners(ipcRouters.SYSTEM.selectLocalFile);
});
</script>

<template>
  <div class="main">
    <breadcrumb>
      <el-button plain type="primary" @click="handleOpenDataFolder">
        <IconifyIconOffline icon="folder-rounded" />
      </el-button>
      <el-button plain type="primary" @click="handleResetConfig">
        <IconifyIconOffline icon="deviceReset" />
      </el-button>
      <el-button plain type="primary" @click="handleImportConfig">
        <IconifyIconOffline icon="file-open-rounded" />
      </el-button>
      <el-button plain type="primary" @click="handleExportConfig">
        <IconifyIconOffline icon="file-save-rounded" />
      </el-button>
      <el-button type="primary" @click="handleSaveGlobalSettings">
        <IconifyIconOffline icon="save-rounded" />
      </el-button>
    </breadcrumb>

    <div v-loading="loading > 0" class="pr-2 app-container-breadcrumb">
      <div class="grid gap-4">
        <div class="p-4 w-full bg-white rounded drop-shadow-lg">
          <div class="flex justify-between items-center mb-4">
            <div class="h2">{{ t("config.title.globalSettings") }}</div>
            <el-alert
              :title="t('config.message.webPortManaged')"
              type="info"
              :closable="false"
              class="max-w-[420px]"
            />
          </div>

          <el-form
            ref="globalFormRef"
            :model="globalSettings"
            :rules="globalRules"
            label-position="right"
            label-width="180"
          >
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item
                  :label="t('config.form.frpcVerson.label')"
                  prop="frpcVersion"
                >
                  <el-select
                    v-model="globalSettings.frpcVersion"
                    class="w-full"
                    clearable
                  >
                    <el-option
                      v-for="v in frpcDesktopStore.downloadedVersions"
                      :key="v.githubReleaseId"
                      :label="v.name"
                      :value="v.githubReleaseId"
                    />
                  </el-select>
                </el-form-item>
              </el-col>

              <el-col :span="8">
                <el-form-item :label="t('config.form.systemLaunchAtStartup.label')">
                  <el-switch
                    v-model="globalSettings.system.launchAtStartup"
                    :active-text="t('common.yes')"
                    :inactive-text="t('common.no')"
                    inline-prompt
                  />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item :label="t('config.form.systemSilentStartup.label')">
                  <el-switch
                    v-model="globalSettings.system.silentStartup"
                    :active-text="t('common.yes')"
                    :inactive-text="t('common.no')"
                    inline-prompt
                  />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item :label="t('config.form.systemAutoConnectOnStartup.label')">
                  <el-switch
                    v-model="globalSettings.system.autoConnectOnStartup"
                    :active-text="t('common.yes')"
                    :inactive-text="t('common.no')"
                    inline-prompt
                  />
                </el-form-item>
              </el-col>
              <el-col :span="24">
                <el-form-item :label="t('config.form.systemLanguage.label')">
                  <el-select
                    v-model="globalSettings.system.language"
                    @change="handleSystemLanguageChange"
                  >
                    <el-option label="中文" value="zh-CN" />
                    <el-option label="English" value="en-US" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </div>

        <div class="p-4 w-full bg-white rounded drop-shadow-lg">
          <div class="flex justify-between items-center mb-4">
            <div class="h2">{{ t("config.title.serverProfiles") }}</div>
            <div class="flex gap-2 items-center">
              <IconifyIconOffline
                class="text-xl font-bold cursor-pointer text-primary"
                icon="content-paste-go"
                @click="handlePasteServerConfig4Base64"
              />
              <el-button type="primary" @click="handleOpenCreateProfile">
                <IconifyIconOffline class="mr-1" icon="add-rounded" />
                {{ t("config.button.addProfile") }}
              </el-button>
            </div>
          </div>

          <div v-if="serverProfiles.length < 1" class="py-10 text-center text-slate-400">
            {{ t("config.message.noProfiles") }}
          </div>

          <div v-else class="grid gap-4 md:grid-cols-2">
            <div
              v-for="profile in serverProfiles"
              :key="profile._id"
              class="p-4 border border-slate-200 rounded-xl"
            >
              <div class="flex justify-between items-start gap-4">
                <div>
                  <div class="text-base font-semibold text-slate-900">
                    {{ profile.name }}
                  </div>
                  <div class="text-sm text-slate-500">
                    {{ profile.serverAddr }}:{{ profile.serverPort }}
                  </div>
                </div>
                <el-tag type="info">{{ profile.transport.protocol }}</el-tag>
              </div>

              <div class="grid gap-2 mt-3 text-sm text-slate-600">
                <div>
                  {{ t("config.card.user") }}:
                  <span class="font-medium text-slate-900">
                    {{ profile.user || "-" }}
                  </span>
                </div>
                <div>
                  {{ t("config.card.auth") }}:
                  <span class="font-medium text-slate-900">
                    {{
                      profile.auth.method === "token"
                        ? t("config.card.authToken")
                        : t("config.card.authNone")
                    }}
                  </span>
                </div>
                <div>
                  {{ t("config.card.multiuser") }}:
                  <span class="font-medium text-slate-900">
                    {{ profile.multiuser ? t("common.yes") : t("common.no") }}
                  </span>
                </div>
                <div>
                  {{ t("config.card.logLevel") }}:
                  <span class="font-medium text-slate-900">{{ profile.log.level }}</span>
                </div>
              </div>

              <div class="flex gap-2 justify-end mt-4">
                <el-button text type="primary" @click="handleCopyServerConfig2Base64(profile)">
                  {{ t("config.button.copyProfile") }}
                </el-button>
                <el-button text type="primary" @click="handleOpenEditProfile(profile)">
                  {{ t("common.modify") }}
                </el-button>
                <el-button text type="danger" @click="handleDeleteProfile(profile)">
                  {{ t("common.delete") }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="visible.copyServerConfig"
      :title="t('config.dialog.copyLink.title')"
      width="500"
      top="5%"
    >
      <el-alert
        class="mb-4"
        :title="t('config.dialog.copyLink.warning.message')"
        type="warning"
        :closable="false"
      />
      <el-input
        v-model="copyServerConfigBase64"
        class="h-30"
        type="textarea"
        :rows="8"
      />
    </el-dialog>

    <el-dialog
      v-model="visible.pasteServerConfig"
      :title="t('config.dialog.importLink.title')"
      width="500"
      top="5%"
    >
      <el-input
        v-model="pasteServerConfigBase64"
        class="h-30"
        type="textarea"
        placeholder="frp://......"
        :rows="8"
      />
      <template #footer>
        <div class="dialog-footer">
          <el-button plain type="primary" @click="handlePasteServerConfigBase64">
            <IconifyIconOffline class="mr-2 cursor-pointer" icon="label-important-rounded" />
            {{ t("config.button.import") }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="profileDialog.visible"
      :title="profileDialog.title"
      width="860"
      @close="closeProfileDialog"
    >
      <el-form
        ref="profileFormRef"
        :model="profileForm"
        :rules="profileRules"
        label-position="right"
        label-width="180"
      >
        <el-row :gutter="16">
          <el-col :span="24">
            <div class="h2 mb-4">{{ t("config.dialog.profile.basicTitle") }}</div>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('config.form.profileName.label')" prop="name">
              <el-input v-model="profileForm.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.serverAddr.label')" prop="serverAddr">
              <el-input v-model="profileForm.serverAddr" placeholder="frps.example.com" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.serverPort.label')" prop="serverPort">
              <el-input-number
                v-model="profileForm.serverPort"
                :min="0"
                :max="65535"
                class="!w-full"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.user.label')">
              <el-input v-model="profileForm.user" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.multiuser.label')">
              <el-switch
                v-model="profileForm.multiuser"
                :active-text="t('common.yes')"
                :inactive-text="t('common.no')"
                inline-prompt
              />
            </el-form-item>
          </el-col>
          <el-col v-if="profileForm.multiuser" :span="24">
            <el-form-item :label="t('config.form.metadatasToken.label')" prop="metadatas.token">
              <el-input v-model="profileForm.metadatas.token" />
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <div class="h2 mb-4">{{ t("config.dialog.profile.authTitle") }}</div>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.authMethod.label')">
              <el-select v-model="profileForm.auth.method" class="w-full">
                <el-option :label="t('config.form.authMethod.none')" value="none" />
                <el-option :label="t('config.form.authMethod.token')" value="token" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="profileForm.auth.method === 'token'" :span="12">
            <el-form-item :label="t('config.form.authToken.label')" prop="auth.token">
              <el-input v-model="profileForm.auth.token" />
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <div class="h2 mb-4">{{ t("config.dialog.profile.transportTitle") }}</div>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportProtocol.label')">
              <el-select v-model="profileForm.transport.protocol" class="w-full">
                <el-option label="tcp" value="tcp" />
                <el-option label="kcp" value="kcp" />
                <el-option label="quic" value="quic" />
                <el-option label="websocket" value="websocket" />
                <el-option label="wss" value="wss" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportProxyURL.label')" prop="transport.proxyURL">
              <el-input v-model="profileForm.transport.proxyURL" placeholder="http://127.0.0.1:7890" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportDialServerTimeout.label')">
              <el-input-number
                v-model="profileForm.transport.dialServerTimeout"
                class="!w-full"
                controls-position="right"
                :min="0"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportDialServerKeepalive.label')">
              <el-input-number
                v-model="profileForm.transport.dialServerKeepalive"
                class="!w-full"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportPoolCount.label')">
              <el-input-number
                v-model="profileForm.transport.poolCount"
                class="!w-full"
                controls-position="right"
                :min="0"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportTcpMux.label')">
              <el-switch
                v-model="profileForm.transport.tcpMux"
                :active-text="t('common.yes')"
                :inactive-text="t('common.no')"
                inline-prompt
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportTcpMuxKeepaliveInterval.label')">
              <el-input-number
                v-model="profileForm.transport.tcpMuxKeepaliveInterval"
                class="!w-full"
                controls-position="right"
                :min="0"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportHeartbeatInterval.label')">
              <el-input-number
                v-model="profileForm.transport.heartbeatInterval"
                class="!w-full"
                controls-position="right"
                :min="0"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.transportHeartbeatTimeout.label')">
              <el-input-number
                v-model="profileForm.transport.heartbeatTimeout"
                class="!w-full"
                controls-position="right"
                :min="0"
              />
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <div class="h2 mb-4">{{ t("config.dialog.profile.tlsTitle") }}</div>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('config.form.tlsEnable.label')">
              <el-switch
                v-model="profileForm.transport.tls.enable"
                :active-text="t('common.yes')"
                :inactive-text="t('common.no')"
                inline-prompt
              />
            </el-form-item>
          </el-col>
          <template v-if="profileForm.transport.tls.enable">
            <el-col :span="24">
              <el-form-item :label="t('config.form.tlsCertFile.label')">
                <el-input
                  v-model="profileForm.transport.tls.certFile"
                  readonly
                  @click="handleSelectFile('cert', ['crt'])"
                />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item :label="t('config.form.tlsKeyFile.label')">
                <el-input
                  v-model="profileForm.transport.tls.keyFile"
                  readonly
                  @click="handleSelectFile('key', ['key'])"
                />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item :label="t('config.form.caCertFile.label')">
                <el-input
                  v-model="profileForm.transport.tls.trustedCaFile"
                  readonly
                  @click="handleSelectFile('ca', ['crt'])"
                />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item :label="t('config.form.tlsServerName.label')">
                <el-input v-model="profileForm.transport.tls.serverName" />
              </el-form-item>
            </el-col>
          </template>

          <el-col :span="24">
            <div class="h2 mb-4">{{ t("config.dialog.profile.logTitle") }}</div>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.logLevel.label')">
              <el-select v-model="profileForm.log.level" class="w-full">
                <el-option label="info" value="info" />
                <el-option label="debug" value="debug" />
                <el-option label="warn" value="warn" />
                <el-option label="error" value="error" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('config.form.logMaxDays.label')">
              <el-input-number
                v-model="profileForm.log.maxDays"
                class="!w-full"
                controls-position="right"
                :min="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeProfileDialog">{{ t("common.close") }}</el-button>
          <el-button type="primary" @click="handleSaveProfile">
            {{ t("common.save") }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
