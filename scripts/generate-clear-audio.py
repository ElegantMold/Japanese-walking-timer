from pathlib import Path
import subprocess, wave, array, math, json

root=Path(__file__).resolve().parent.parent
dest=root/'clear-audio'; dest.mkdir(exist_ok=True)
rate=22050
prompts={'warmup':'Start five minute warmup','brisk':'Walk briskly','casual':'Walk casually','cooldown':'Start cooldown. Routine complete'}
clips={}
for name,text in prompts.items():
    aiff=dest/(name+'.aiff'); wav=dest/(name+'.wav')
    subprocess.run(['/usr/bin/say','-v','Samantha','-r','165','-o',str(aiff),text],check=True)
    subprocess.run(['/usr/bin/afconvert',str(aiff),str(wav),'-f','WAVE','-d','LEI16@22050'],check=True)
    with wave.open(str(wav)) as w:
        assert w.getnchannels()==1 and w.getsampwidth()==2 and w.getframerate()==rate
        samples=array.array('h',w.readframes(w.getnframes()))
        assert len(samples)>rate/4 and max(abs(v) for v in samples)>500
        clips[name]=samples
track=array.array('h',[0])*(2106*rate)
starts=[(0,'warmup')]+[(300+i*180,'brisk' if i%2==0 else 'casual') for i in range(10)]+[(2100,'cooldown')]
for second,name in starts:
    samples=clips[name]; assert len(samples)<6*rate
    start=second*rate; track[start:start+len(samples)]=samples
for boundary,_ in starts[1:]:
    for remaining in range(5,0,-1):
        start=(boundary-remaining)*rate; length=round(.14*rate); freq=1046 if remaining==1 else 784
        for i in range(length):
            edge=min(1,i/(.01*rate),(length-i)/(.015*rate))
            track[start+i]=round(math.sin(2*math.pi*freq*i/rate)*32767*.22*edge)
master=dest/'routine-guidance-samantha-v12.wav'
with wave.open(str(master),'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(track.tobytes())
encoded=dest/'routine-guidance-samantha-v12.m4a'
subprocess.run(['/usr/bin/afconvert',str(master),str(encoded),'-f','m4af','-d','aac ','-s','3','-q','100'],check=True)
decoded=dest/'decoded-validation.wav'
subprocess.run(['/usr/bin/afconvert',str(encoded),str(decoded),'-f','WAVE','-d','LEI16@22050'],check=True)
print(json.dumps({'master_bytes':master.stat().st_size,'encoded_bytes':encoded.stat().st_size,'sample_rate':rate,'voice':'Samantha','prompt_durations':{k:len(v)/rate for k,v in clips.items()}},indent=2))
