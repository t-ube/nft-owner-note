import Image from 'next/image';

const IconTitle = () => (
  <div className="text-center mb-6">
    <div className="flex items-center justify-center gap-2 mb-2">
      <div className="flex items-center justify-center">
        <Image 
          src="/images/owner_note_logo.png" 
          alt="Owner Note" 
          width={256}
          height={152}
          className="opacity-75 hover:opacity-100 transition-opacity dark:invert"
          draggable={false}
        />
      </div>
    </div>
  </div>
);

export default IconTitle;