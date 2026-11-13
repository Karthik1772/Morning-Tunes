export type EndBehaviour = "stop" | "repeat" | "next";
export type Schedule = "daily" | "weekdays" | "weekends" | "custom";
export type MusicSource = "playlist" | "songs";
export type Song = { id: string; videoId: string; title: string; url: string };
export type Settings = { alarmTime:string; schedule:Schedule; customDays:number[]; enabled:boolean; endBehaviour:EndBehaviour; shuffle:boolean; fadeIn:boolean; volume:number; timezone:string; musicSource:MusicSource; playlistUrl:string; songs:Song[]; nextPlaylistUrl:string };
export const DEFAULT_SETTINGS:Settings = { alarmTime:"06:00", schedule:"daily", customDays:[1,2,3,4,5,6,0], enabled:false, endBehaviour:"stop", shuffle:false, fadeIn:true, volume:70, timezone:"Asia/Kolkata", musicSource:"playlist", playlistUrl:"https://www.youtube.com/playlist?list=PLBo2BExIwYMtr4a-TVwyNvbb1lvbN70jd", songs:[], nextPlaylistUrl:"" };
export const STORAGE_KEY = "morningtunes.settings.v1";
