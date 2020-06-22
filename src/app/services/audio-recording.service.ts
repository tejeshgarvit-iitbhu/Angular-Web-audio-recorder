import { Injectable, NgZone } from '@angular/core';
import * as WebAudioRecorder from 'web-audio-recorder-js';
import * as moment from 'moment';
import { Observable, Subject } from 'rxjs';
import { isNullOrUndefined } from 'util';

interface RecordedAudioOutput {
  blob: Blob;
  title: string;
}

@Injectable()
export class AudioRecordingService {
  URL = window.URL;

  private stream;
  private recorder;
  private interval;
  private startTime;
  private _recorded = new Subject<RecordedAudioOutput>();
  private _recordingTime = new Subject<string>();
  private _recordingFailed = new Subject<string>();
  private gumStream; 						//stream from getUserMedia()
  private input; 							//MediaStreamAudioSourceNode  we'll be recording
  private encodingType; 					//holds selected encoding for resulting audio (file)
  private encodeAfterRecord = true;       // when to encode

  // shim for AudioContext when it's not avb.
  private AudioContext = window.AudioContext;
  private audioContext; //new audio context to help us record


  getRecordedBlob(): Observable<RecordedAudioOutput> {
    return this._recorded.asObservable();
  }

  getRecordedTime(): Observable<string> {
    return this._recordingTime.asObservable();
  }

  recordingFailed(): Observable<string> {
    return this._recordingFailed.asObservable();
  }


  startRecording() {

    if (this.recorder) {
      // It means recording is already started or it is already recording something
      return;
    }

    console.log("startRecording() called");

    /*
      Simple constraints object, for more advanced features see
      https://addpipe.com/blog/audio-constraints-getusermedia/
    */
    this._recordingTime.next('00:00');
    var constraints = { audio: true, video: false }

    /*
    	We're using the standard promise based getUserMedia()
    	https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
	*/

    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
      console.log("getUserMedia() success, stream created, initializing WebAudioRecorder...");

      /*
        create an audio context after getUserMedia is called
        sampleRate might change after getUserMedia is called, like it does on macOS when recording through AirPods
        the sampleRate defaults to the one set in your OS for your playback device
      */
      this.audioContext = new AudioContext();
      this.stream = stream;


      //assign to gumStream for later use
      //this.gumStream = stream;

      /* use the stream */
      this.input = this.audioContext.createMediaStreamSource(stream);

      //stop the input from playing back through the speakers
      // input.connect(audioContext.destination)

      //get the encoding
      this.encodingType = "ogg";


      this.recorder = new WebAudioRecorder(this.input, {
        workerDir: "node_modules/web-audio-recorder-js/lib-minified/", // must end with slash
        encoding: this.encodingType,
        numChannels: 2, //2 is the default, mp3 encoding supports only 2
        onEncoderLoading: function(recorder, encoding) { //check 'this'
          // show "loading encoder..." display
          console.log("Loading " + encoding + " encoder...");
        },
        onEncoderLoaded: function(recorder, encoding) {
          // hide "loading encoder..." display
          console.log(encoding + " encoder loaded");
        }
      });
      console.log("hiashi");


      this.recorder.setOptions({
        timeLimit: 120,
        encodeAfterRecord: this.encodeAfterRecord,
        ogg: { quality: 0.5 },
        mp3: { bitRate: 160 }
      });

      //start the recording process
      this.recorder.startRecording();
      this.startTime = moment();
      this.interval = setInterval(
        () => {
          const currentTime = moment();
          const diffTime = moment.duration(currentTime.diff(this.startTime));
          const time = this.toString(diffTime.minutes()) + ':' + this.toString(diffTime.seconds());
          this._recordingTime.next(time);
        },
        1000
      );

      console.log("Recording started");

    }).catch(function(err) {
      //enable the record button if getUSerMedia() fails
      this._recordingFailed.next();
    });
  }

  abortRecording() {
    this.stopMedia();
  }


  private toString(value) {
    let val = value;
    if (!value) {
      val = '00';
    }
    if (value < 10) {
      val = '0' + value;
    }
    return val;
  }

  stopRecording() {
    if (this.recorder) {
      this.recorder.stop((blob) => {
        if (this.startTime) {
          const oggName = encodeURIComponent('audio_' + new Date().getTime() + '.ogg');
          this.stopMedia();
          this._recorded.next({ blob: blob, title: oggName });
        }
      }, () => {
        this.stopMedia();
        this._recordingFailed.next();
      });
    }

  }

  private stopMedia() {
    if (this.recorder) {
      this.recorder = null;
      clearInterval(this.interval);
      this.startTime = null;
      if (this.stream) {
        this.stream.getAudioTracks().forEach(track => track.stop());
        this.stream = null;
      }
    }
  }


}
