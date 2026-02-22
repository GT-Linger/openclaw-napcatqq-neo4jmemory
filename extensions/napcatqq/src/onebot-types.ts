export type OneBotVersion = 11;

export type OneBotStatus = "ok" | "failed";

export type OneBotRetcode =
  | 0
  | 1000
  | 1001
  | 1002
  | 1003
  | 1004
  | 1005
  | 1006
  | 1400
  | 1401
  | 1403
  | 1404
  | 1415
  | 1500;

export type OneBotResponse<T = unknown> = {
  status: OneBotStatus;
  retcode: OneBotRetcode;
  data: T | null;
  message: string;
  wording: string;
  echo?: string | number;
};

export type OneBotRequest = {
  action: string;
  params: Record<string, unknown>;
  echo?: string | number;
};

export type OneBotMessageSegmentType =
  | "text"
  | "at"
  | "face"
  | "image"
  | "record"
  | "video"
  | "file"
  | "online_file"
  | "reply"
  | "forward"
  | "node"
  | "json"
  | "xml"
  | "poke"
  | "share"
  | "contact"
  | "location"
  | "music"
  | "redbag"
  | "markdown"
  | "mface"
  | "dice"
  | "rps"
  | "miniapp"
  | "flashtransfer";

export type OneBotMessageSegment = {
  type: OneBotMessageSegmentType;
  data: Record<string, unknown>;
};

export type OneBotMessage = OneBotMessageSegment[];

export type OneBotTextSegment = {
  type: "text";
  data: { text: string };
};

export type OneBotAtSegment = {
  type: "at";
  data: { qq: string | number; name?: string };
};

export type OneBotImageSegment = {
  type: "image";
  data: {
    file: string;
    url?: string;
    type?: "flash" | "show";
    cache?: boolean;
    proxy?: boolean;
    timeout?: number;
  };
};

export type OneBotRecordSegment = {
  type: "record";
  data: {
    file: string;
    url?: string;
    cache?: boolean;
    proxy?: boolean;
    timeout?: number;
  };
};

export type OneBotReplySegment = {
  type: "reply";
  data: { id: string | number; seq?: number };
};

export type FileBaseData = {
  file: string;
  path?: string;
  url?: string;
  name?: string;
  thumb?: string;
};

export type OneBotFileSegment = {
  type: "file";
  data: FileBaseData;
};

export type OneBotVideoSegment = {
  type: "video";
  data: FileBaseData;
};

export type OneBotOnlineFileSegment = {
  type: "online_file";
  data: {
    msgId: string;
    elementId: string;
    fileName: string;
    fileSize: string;
    isDir: boolean;
  };
};

export type OneBotFlashTransferSegment = {
  type: "flashtransfer";
  data: { fileSetId: string };
};

export type OneBotDiceSegment = {
  type: "dice";
  data: { result: number | string };
};

export type OneBotRPSSegment = {
  type: "rps";
  data: { result: number | string };
};

export type OneBotMFaceSegment = {
  type: "mface";
  data: {
    emoji_package_id: number;
    emoji_id: string;
    key: string;
    summary: string;
  };
};

export type OneBotMarkdownSegment = {
  type: "markdown";
  data: { content: string };
};

export type OneBotMiniAppSegment = {
  type: "miniapp";
  data: { data: string };
};

export type OneBotPokeSegment = {
  type: "poke";
  data: { type: string; id: string };
};

export type OneBotContactSegment = {
  type: "contact";
  data: { type: string; id: string };
};

export type OneBotLocationSegment = {
  type: "location";
  data: {
    lat: number | string;
    lon: number | string;
    title?: string;
    content?: string;
  };
};

export type OneBotJsonSegment = {
  type: "json";
  data: { data: string | object; config?: { token: string } };
};

export type OneBotXmlSegment = {
  type: "xml";
  data: { data: string };
};

export type OneBotPostType = "message" | "notice" | "request" | "meta_event";

export type OneBotMessageType = "private" | "group";

export type OneBotSubType = string;

export type OneBotMessageEvent = {
  time: number;
  self_id: number;
  post_type: "message";
  message_type: OneBotMessageType;
  sub_type: OneBotSubType;
  message_id: number | string;
  user_id: number;
  message: OneBotMessage | string;
  raw_message: string;
  font: number;
  sender: OneBotSender;
  group_id?: number;
  anonymous?: OneBotAnonymous;
};

export type OneBotSender = {
  user_id: number;
  nickname: string;
  card?: string;
  sex?: "male" | "female" | "unknown";
  age?: number;
  area?: string;
  level?: string;
  role?: "owner" | "admin" | "member";
  title?: string;
};

export type OneBotAnonymous = {
  id: number;
  name: string;
  flag: string;
};

export type OneBotGroupIncreaseNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "group_increase";
  sub_type: "approve" | "invite";
  group_id: number;
  user_id: number;
  operator_id?: number;
};

export type OneBotGroupDecreaseNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "group_decrease";
  sub_type: "leave" | "kick" | "kick_me";
  group_id: number;
  user_id: number;
  operator_id?: number;
};

export type OneBotGroupAdminNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "group_admin";
  sub_type: "set" | "unset";
  group_id: number;
  user_id: number;
};

export type OneBotGroupRecallNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "group_recall";
  group_id: number;
  user_id: number;
  operator_id: number;
  message_id: number | string;
};

export type OneBotFriendRecallNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "friend_recall";
  user_id: number;
  message_id: number | string;
};

export type OneBotFriendAddNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "friend_add";
  user_id: number;
};

export type OneBotGroupBanNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "group_ban";
  sub_type: "ban" | "lift_ban";
  group_id: number;
  user_id: number;
  operator_id: number;
  duration: number;
};

export type OneBotNotifyNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: "notify";
  sub_type: "poke" | "lucky_king" | "honor";
  group_id?: number;
  user_id: number;
  target_id?: number;
  honor_type?: "talkative" | "performer" | "emotion";
};

export type OneBotNoticeEvent = {
  time: number;
  self_id: number;
  post_type: "notice";
  notice_type: string;
  sub_type?: string;
  user_id?: number;
  group_id?: number;
  operator_id?: number;
  target_id?: number;
  message_id?: number | string;
  [key: string]: unknown;
};

export type OneBotRequestEvent = {
  time: number;
  self_id: number;
  post_type: "request";
  request_type: "friend" | "group";
  sub_type: string;
  user_id: number;
  comment?: string;
  flag: string;
  group_id?: number;
};

export type OneBotMetaEvent = {
  time: number;
  self_id: number;
  post_type: "meta_event";
  meta_event_type: "lifecycle" | "heartbeat";
  sub_type?: string;
  status?: OneBotHeartbeatStatus;
  interval?: number;
};

export type OneBotHeartbeatStatus = {
  online: boolean;
  good: boolean;
  [key: string]: unknown;
};

export type OneBotEvent =
  | OneBotMessageEvent
  | OneBotNoticeEvent
  | OneBotRequestEvent
  | OneBotMetaEvent;

export type OneBotSendPrivateMsgParams = {
  user_id: number | string;
  message: OneBotMessage | string;
  auto_escape?: boolean;
};

export type OneBotSendGroupMsgParams = {
  group_id: number | string;
  message: OneBotMessage | string;
  auto_escape?: boolean;
};

export type OneBotSendMsgParams = {
  message_type?: "private" | "group";
  user_id?: number | string;
  group_id?: number | string;
  message: OneBotMessage | string;
  auto_escape?: boolean;
};

export type OneBotSendMsgResult = {
  message_id: number | string;
};

export type OneBotGetLoginInfoResult = {
  user_id: number;
  nickname: string;
};

export type OneBotGetFriendListResult = Array<{
  user_id: number;
  nickname: string;
  remark: string;
}>;

export type OneBotGetGroupListResult = Array<{
  group_id: number;
  group_name: string;
  member_count: number;
  max_member_count: number;
}>;

export type OneBotGetGroupMemberListResult = Array<{
  user_id: number;
  nickname: string;
  card: string;
  role: "owner" | "admin" | "member";
}>;

export type OneBotGetGroupMemberInfoParams = {
  group_id: number | string;
  user_id: number | string;
  no_cache?: boolean;
};

export type OneBotGetGroupMemberInfoResult = {
  user_id: number;
  nickname: string;
  card: string;
  role: "owner" | "admin" | "member";
  join_time: number;
  last_sent_time: number;
  title: string;
};

export type OneBotDeleteMsgParams = {
  message_id: number | string;
};

export type OneBotSetGroupKickParams = {
  group_id: number | string;
  user_id: number | string;
  reject_add_request?: boolean;
};

export type OneBotSetGroupBanParams = {
  group_id: number | string;
  user_id: number | string;
  duration?: number;
};

export type OneBotSetGroupWholeBanParams = {
  group_id: number | string;
  enable?: boolean;
};

export type OneBotSetGroupAdminParams = {
  group_id: number | string;
  user_id: number | string;
  enable?: boolean;
};

export type OneBotSetGroupCardParams = {
  group_id: number | string;
  user_id: number | string;
  card?: string;
};

export type OneBotSetGroupNameParams = {
  group_id: number | string;
  group_name: string;
};

export type OneBotSetGroupLeaveParams = {
  group_id: number | string;
  is_dismiss?: boolean;
};

export type OneBotSetFriendAddRequestParams = {
  flag: string;
  approve?: boolean;
  remark?: string;
};

export type OneBotSetGroupAddRequestParams = {
  flag: string;
  request_type: "add" | "invite";
  approve?: boolean;
  reason?: string;
};

export type OneBotGetImageParams = {
  file: string;
};

export type OneBotGetImageResult = {
  file: string;
  url: string;
  size?: number;
};

export type OneBotGetRecordParams = {
  file: string;
  out_format?: "mp3" | "wav" | "wma" | "m4a" | "ogg" | "amr" | "flac";
};

export type OneBotGetRecordResult = {
  file: string;
  url: string;
};

export type OneBotCanSendImageResult = {
  yes: boolean;
};

export type OneBotCanSendRecordResult = {
  yes: boolean;
};

export type OneBotGetStatusResult = {
  online: boolean;
  good: boolean;
  [key: string]: unknown;
};

export type OneBotGetVersionInfoResult = {
  app_name: string;
  app_version: string;
  protocol_version: string;
  onebot_version: string;
};

export type OneBotUploadPrivateFileParams = {
  user_id: number | string;
  file: string;
  name: string;
};

export type OneBotUploadGroupFileParams = {
  group_id: number | string;
  file: string;
  name: string;
  folder?: string;
};

export type OneBotGetFileParams = {
  file_id: string;
};

export type OneBotGetFileResult = {
  file: string;
  url?: string;
  file_id?: string;
  busid?: number;
};

export type OneBotSendFileResult = {
  message_id: number | string;
};
