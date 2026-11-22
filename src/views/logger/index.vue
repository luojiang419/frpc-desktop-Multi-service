<script lang="ts" setup>
import Breadcrumb from "@/layout/compoenets/Breadcrumb.vue";
import { on, removeRouterListeners, send } from "@/utils/ipcUtils";
import { useDebounceFn } from "@vueuse/core";
import { ElMessage } from "element-plus";
import { defineComponent, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { ipcRouters } from "../../../electron/core/IpcRouter";
import LogView from "./LogView.vue";
import { LogLevel, LogRecord } from "./log";

defineComponent({
  name: "Logger"
});

type ServerLogOption = Pick<FrpsServerProfile, "_id" | "name" | "serverAddr" | "serverPort">;

const { t } = useI18n();
const route = useRoute();
const refreshStatus = ref(false);
const logLoading = ref(true);
const autoRefresh = ref(false);
const autoRefreshTimer = ref<number | null>(null);
const autoRefreshTime = ref(10);
const activeTabName = ref("app_log");
const logRecords = ref<Array<LogRecord>>([]);
const serverOptions = ref<ServerLogOption[]>([]);
const selectedServerId = ref("");

const normalizeLogRecords = (data: string, appLog = false) => {
  if (!data) {
    return [];
  }
  return data
    .split("\n")
    .filter(Boolean)
    .map(line => {
      if ((appLog && line.indexOf("[error]") !== -1) || line.indexOf("[E]") !== -1) {
        return { id: Date.now() + Math.random(), context: line, level: LogLevel.ERROR };
      }
      if ((appLog && line.indexOf("[info]") !== -1) || line.indexOf("[I]") !== -1) {
        return { id: Date.now() + Math.random(), context: line, level: LogLevel.INFO };
      }
      if ((appLog && line.indexOf("[debug]") !== -1) || line.indexOf("[D]") !== -1) {
        return { id: Date.now() + Math.random(), context: line, level: LogLevel.DEBUG };
      }
      if ((appLog && line.indexOf("[warn]") !== -1) || line.indexOf("[W]") !== -1) {
        return { id: Date.now() + Math.random(), context: line, level: LogLevel.WARN };
      }
      return { id: Date.now() + Math.random(), context: line, level: LogLevel.INFO };
    })
    .reverse();
};

const openLocalLog = useDebounceFn(() => {
  if (activeTabName.value === "app_log") {
    send(ipcRouters.LOG.openAppLogFile);
  } else if (selectedServerId.value) {
    send(ipcRouters.LOG.openFrpcLogFile, selectedServerId.value);
  }
}, 1000);

const refreshLog = useDebounceFn(() => {
  refreshStatus.value = true;
  logLoading.value = true;
  logRecords.value = [];
  if (activeTabName.value === "app_log") {
    send(ipcRouters.LOG.getAppLogContent);
  } else if (selectedServerId.value) {
    send(ipcRouters.LOG.getFrpLogContent, selectedServerId.value);
  } else {
    logLoading.value = false;
  }
}, 300);

const handleAutoRefreshChange = () => {
  if (autoRefresh.value) {
    if (autoRefreshTimer.value) {
      clearInterval(autoRefreshTimer.value);
    }
    autoRefreshTimer.value = window.setInterval(() => {
      autoRefreshTime.value--;
      if (autoRefreshTime.value <= 0) {
        autoRefreshTime.value = 10;
        refreshLog();
      }
    }, 1000);
  } else if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value);
    autoRefreshTimer.value = null;
    autoRefreshTime.value = 10;
  }
};

const handleTabChange = (tab: string) => {
  activeTabName.value = tab;
  refreshLog();
};

const loadServerOptions = () => {
  send(ipcRouters.LOG.getServerLogOptions);
};

watch(selectedServerId, () => {
  if (activeTabName.value === "frpc_log") {
    refreshLog();
  }
});

onMounted(() => {
  on(ipcRouters.LOG.getFrpLogContent, data => {
    logRecords.value = normalizeLogRecords(data, false);
    logLoading.value = false;
    if (refreshStatus.value) {
      ElMessage({
        type: "success",
        message: t("logger.message.refreshSuccess")
      });
      refreshStatus.value = false;
    }
  });

  on(ipcRouters.LOG.getAppLogContent, data => {
    logRecords.value = normalizeLogRecords(data, true);
    logLoading.value = false;
    if (refreshStatus.value) {
      ElMessage({
        type: "success",
        message: t("logger.message.refreshSuccess")
      });
      refreshStatus.value = false;
    }
  });

  on(ipcRouters.LOG.getServerLogOptions, data => {
    serverOptions.value = data;
    const routeServerId =
      typeof route.query.serverId === "string" ? route.query.serverId : "";
    if (routeServerId && data.some(item => item._id === routeServerId)) {
      selectedServerId.value = routeServerId;
    } else if (!selectedServerId.value && data.length > 0) {
      selectedServerId.value = data[0]._id;
    }
    if (activeTabName.value === "frpc_log") {
      refreshLog();
    }
  });

  on(ipcRouters.LOG.openFrpcLogFile, () => {
    ElMessage({
      type: "success",
      message: t("logger.message.openSuccess")
    });
  });

  on(ipcRouters.LOG.openAppLogFile, () => {
    ElMessage({
      type: "success",
      message: t("logger.message.openSuccess")
    });
  });

  loadServerOptions();
  send(ipcRouters.LOG.getAppLogContent);
});

onUnmounted(() => {
  removeRouterListeners(ipcRouters.LOG.getFrpLogContent);
  removeRouterListeners(ipcRouters.LOG.getAppLogContent);
  removeRouterListeners(ipcRouters.LOG.openFrpcLogFile);
  removeRouterListeners(ipcRouters.LOG.openAppLogFile);
  removeRouterListeners(ipcRouters.LOG.getServerLogOptions);
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value);
  }
  autoRefreshTime.value = 10;
});
</script>

<template>
  <div class="main">
    <breadcrumb />
    <div class="app-container-breadcrumb">
      <el-tabs
        v-model="activeTabName"
        class="log-tabs"
        @tab-change="handleTabChange"
      >
        <el-tab-pane
          :label="t('logger.tab.appLog')"
          name="app_log"
          class="log-container"
        >
          <log-view :log-records="logRecords" :loading="logLoading">
            <template #toolbar>
              <span v-if="autoRefresh" class="text-sm font-medium text-gray-300">
                {{ t("logger.autoRefreshTime", { time: autoRefreshTime }) }}
              </span>
              <el-switch
                v-model="autoRefresh"
                size="small"
                class="text-gray-300"
                @change="handleAutoRefreshChange"
              >
                {{ t("logger.autoRefresh") }}
              </el-switch>
              <IconifyIconOffline
                class="text-gray-400 transition-colors duration-200 cursor-pointer hover:text-gray-300"
                icon="refresh-rounded"
                size="small"
                @click="refreshLog"
              />
              <IconifyIconOffline
                class="text-gray-400 transition-colors duration-200 cursor-pointer hover:text-gray-300"
                icon="file-open-rounded"
                @click="openLocalLog"
              />
            </template>
          </log-view>
        </el-tab-pane>

        <el-tab-pane
          :label="t('logger.tab.frpcLog')"
          name="frpc_log"
          class="log-container"
        >
          <log-view :log-records="logRecords" :loading="logLoading">
            <template #toolbar>
              <el-select
                v-model="selectedServerId"
                size="small"
                class="mr-2 !w-64"
                :placeholder="t('logger.server.placeholder')"
              >
                <el-option
                  v-for="item in serverOptions"
                  :key="item._id"
                  :label="`${item.name} (${item.serverAddr}:${item.serverPort})`"
                  :value="item._id"
                />
              </el-select>
              <span v-if="autoRefresh" class="text-sm font-medium text-gray-300">
                {{ t("logger.autoRefreshTime", { time: autoRefreshTime }) }}
              </span>
              <el-switch
                v-model="autoRefresh"
                size="small"
                class="text-gray-300"
                @change="handleAutoRefreshChange"
              >
                {{ t("logger.autoRefresh") }}
              </el-switch>
              <IconifyIconOffline
                class="text-gray-400 transition-colors duration-200 cursor-pointer hover:text-gray-300"
                icon="refresh-rounded"
                size="small"
                @click="refreshLog"
              />
              <IconifyIconOffline
                class="text-gray-400 transition-colors duration-200 cursor-pointer hover:text-gray-300"
                icon="file-open-rounded"
                @click="openLocalLog"
              />
            </template>
          </log-view>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style lang="scss" scoped>
::-webkit-scrollbar-track-piece {
  background-color: transparent;
}

.log-tabs {
  height: 100%;
}

.log-container {
  height: 100%;
}
</style>
